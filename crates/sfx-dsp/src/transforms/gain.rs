//! `Gain` — sample-accurate linear attenuation (or mild boost) with a
//! per-sample linear smoother so parameter changes don't click.
//!
//! Parameters (exposed as stable-ABI `u16` IDs per ADR-016):
//!
//! | ID | Name             | Range            | Default |
//! |----|------------------|------------------|---------|
//! | 0  | `BYPASS`         | `0.0` or nonzero | `0.0`   |
//! | 1  | `ATTENUATION_DB` | `-60.0..=6.0` dB | `0.0`   |
//! | 2  | `SMOOTHING_MS`   | `0..=500` ms     | `20`    |
//!
//! The linear envelope reaches the target in `smoothing_ms * sample_rate
//! / 1000` samples and then holds. No overshoot — the increment is
//! clamped when it would cross the target on the next sample.

use crate::transform::Transform;
use libm::powf;

/// Stable param ID: `BYPASS`. `value != 0.0` forces the transform to a
/// passthrough (`output = input`); `value == 0.0` re-enables processing.
/// Per ADR-016, renaming or renumbering a param ID is a breaking change.
pub const BYPASS: u16 = 0;

/// Stable param ID: `ATTENUATION_DB`. Linear dB, clamped to
/// `[ATTENUATION_DB_MIN, ATTENUATION_DB_MAX]`.
pub const ATTENUATION_DB: u16 = 1;

/// Stable param ID: `SMOOTHING_MS`. Clamped to
/// `[0, SMOOTHING_MS_MAX]`.
pub const SMOOTHING_MS: u16 = 2;

pub const ATTENUATION_DB_MIN: f32 = -60.0;
pub const ATTENUATION_DB_MAX: f32 = 6.0;
pub const SMOOTHING_MS_MAX: u16 = 500;

const DEFAULT_SMOOTHING_MS: u16 = 20;
const DEFAULT_SAMPLE_RATE: u32 = 48_000;

/// Sample-accurate gain envelope with per-sample linear smoother.
#[derive(Debug, Clone)]
pub struct Gain {
    sample_rate: u32,
    target_gain: f32,
    current_gain: f32,
    smoothing_ms: u16,
    step_per_sample: f32,
    bypass: bool,
}

impl Default for Gain {
    fn default() -> Self {
        Self::new()
    }
}

impl Gain {
    pub const fn new() -> Self {
        Self {
            sample_rate: DEFAULT_SAMPLE_RATE,
            target_gain: 1.0,
            current_gain: 1.0,
            smoothing_ms: DEFAULT_SMOOTHING_MS,
            step_per_sample: 0.0,
            bypass: false,
        }
    }

    fn clamp_db(db: f32) -> f32 {
        if !db.is_finite() {
            0.0
        } else if db < ATTENUATION_DB_MIN {
            ATTENUATION_DB_MIN
        } else if db > ATTENUATION_DB_MAX {
            ATTENUATION_DB_MAX
        } else {
            db
        }
    }

    fn db_to_linear(db: f32) -> f32 {
        powf(10.0, db / 20.0)
    }

    fn recompute_step(&mut self) {
        let diff = self.target_gain - self.current_gain;
        if self.smoothing_ms == 0 {
            self.current_gain = self.target_gain;
            self.step_per_sample = 0.0;
            return;
        }
        let smoothing_samples = ((self.smoothing_ms as u32)
            .saturating_mul(self.sample_rate)
            / 1000)
            .max(1);
        self.step_per_sample = diff / smoothing_samples as f32;
    }
}

impl Transform for Gain {
    fn prepare(&mut self, sample_rate: u32, _max_block: usize) {
        let rate = if sample_rate == 0 { DEFAULT_SAMPLE_RATE } else { sample_rate };
        self.sample_rate = rate;
        self.recompute_step();
    }

    fn set_param(&mut self, id: u16, value: f32, smoothing_ms: u16) {
        let smoothing = smoothing_ms.min(SMOOTHING_MS_MAX);
        match id {
            BYPASS => {
                self.bypass = value != 0.0;
            }
            ATTENUATION_DB => {
                let db = Self::clamp_db(value);
                self.target_gain = Self::db_to_linear(db);
                self.smoothing_ms = smoothing;
                self.recompute_step();
            }
            SMOOTHING_MS => {
                let mut ms = if value.is_finite() && value >= 0.0 { value as u32 } else { 0 };
                if ms > SMOOTHING_MS_MAX as u32 {
                    ms = SMOOTHING_MS_MAX as u32;
                }
                self.smoothing_ms = ms as u16;
                self.recompute_step();
            }
            _ => {}
        }
    }

    fn process(&mut self, input: &[f32], output: &mut [f32]) {
        let n = input.len().min(output.len());
        if self.bypass {
            output[..n].copy_from_slice(&input[..n]);
            return;
        }
        for i in 0..n {
            if self.step_per_sample != 0.0 {
                let next = self.current_gain + self.step_per_sample;
                let reached = (self.step_per_sample > 0.0 && next >= self.target_gain)
                    || (self.step_per_sample < 0.0 && next <= self.target_gain);
                if reached {
                    self.current_gain = self.target_gain;
                    self.step_per_sample = 0.0;
                } else {
                    self.current_gain = next;
                }
            }
            output[i] = input[i] * self.current_gain;
        }
    }

    fn reset(&mut self) {
        self.current_gain = self.target_gain;
        self.step_per_sample = 0.0;
    }

    fn id(&self) -> &'static str {
        "gain"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use assert_no_alloc::assert_no_alloc;
    use proptest::prelude::*;

    #[global_allocator]
    static A: assert_no_alloc::AllocDisabler = assert_no_alloc::AllocDisabler;

    const SR: u32 = 48_000;

    fn fresh() -> Gain {
        let mut g = Gain::new();
        g.prepare(SR, 2048);
        g
    }

    #[test]
    fn id_is_gain() {
        assert_eq!(Gain::new().id(), "gain");
    }

    #[test]
    fn bypass_identity_at_zero_db() {
        let mut g = fresh();
        g.set_param(ATTENUATION_DB, 0.0, 0);
        let input: Vec<f32> = (0..128).map(|i| (i as f32) / 128.0 - 0.5).collect();
        let mut output = vec![0.0_f32; 128];
        g.process(&input, &mut output);
        for (a, b) in input.iter().zip(output.iter()) {
            assert!((a - b).abs() < 1e-6, "got {b}, expected {a}");
        }
    }

    #[test]
    fn bypass_param_passes_input_through() {
        let mut g = fresh();
        g.set_param(ATTENUATION_DB, -24.0, 0);
        g.reset();
        g.set_param(BYPASS, 1.0, 0);
        let input: Vec<f32> = (0..64).map(|i| (i as f32).sin()).collect();
        let mut output = vec![0.0_f32; 64];
        g.process(&input, &mut output);
        for (a, b) in input.iter().zip(output.iter()) {
            assert_eq!(a, b);
        }
    }

    #[test]
    fn attenuation_clamps_to_bounds() {
        let mut g = fresh();
        g.set_param(ATTENUATION_DB, -999.0, 0);
        g.reset();
        let mut out = [0.0_f32; 1];
        g.process(&[1.0], &mut out);
        let expected = libm::powf(10.0, ATTENUATION_DB_MIN / 20.0);
        assert!((out[0] - expected).abs() < 1e-6);

        g.set_param(ATTENUATION_DB, 999.0, 0);
        g.reset();
        g.process(&[1.0], &mut out);
        let expected = libm::powf(10.0, ATTENUATION_DB_MAX / 20.0);
        assert!((out[0] - expected).abs() < 1e-6);
    }

    #[test]
    fn smoothing_reaches_target_within_n_samples() {
        let mut g = fresh();
        // Start at -20 dB, snap, then ramp to 0 dB over 10 ms.
        g.set_param(ATTENUATION_DB, -20.0, 0);
        g.reset();
        g.set_param(ATTENUATION_DB, 0.0, 10);
        let n_samples = (10u32 * SR / 1000) as usize; // 480 samples
        let input = vec![1.0_f32; n_samples + 32];
        let mut output = vec![0.0_f32; n_samples + 32];
        g.process(&input, &mut output);

        // Monotonic non-decreasing ramp.
        for i in 1..n_samples {
            assert!(
                output[i] >= output[i - 1] - 1e-6,
                "non-monotonic at {i}: {} → {}",
                output[i - 1],
                output[i]
            );
        }
        // After n samples we're at (or have reached) the target (1.0).
        for i in n_samples..output.len() {
            assert!((output[i] - 1.0).abs() < 1e-4, "tail sample {i} = {}", output[i]);
        }
    }

    #[test]
    fn smoothing_has_no_overshoot() {
        let mut g = fresh();
        g.set_param(ATTENUATION_DB, -40.0, 0);
        g.reset();
        g.set_param(ATTENUATION_DB, -6.0, 50);
        let target = libm::powf(10.0, -6.0 / 20.0);
        let input = vec![1.0_f32; 4096];
        let mut output = vec![0.0_f32; 4096];
        g.process(&input, &mut output);
        for (i, &y) in output.iter().enumerate() {
            assert!(y <= target + 1e-6, "overshoot at {i}: y={} target={}", y, target);
        }
    }

    #[test]
    fn process_is_allocation_free() {
        let mut g = fresh();
        g.set_param(ATTENUATION_DB, -12.0, 20);
        let input = vec![0.25_f32; 128];
        let mut output = vec![0.0_f32; 128];
        assert_no_alloc(|| {
            for _ in 0..10_000 {
                g.process(&input, &mut output);
            }
        });
    }

    #[test]
    fn set_param_is_allocation_free() {
        let mut g = fresh();
        assert_no_alloc(|| {
            for i in 0..10_000 {
                let db = ((i % 60) as f32) - 30.0;
                g.set_param(ATTENUATION_DB, db, 20);
            }
        });
    }

    proptest! {
        #[test]
        fn output_length_matches_input(
            block in prop_oneof![
                Just(1usize), Just(127), Just(128), Just(129),
                Just(1024), Just(2048),
                (2usize..=2048),
            ],
            db in -60.0f32..=6.0,
            smoothing in 0u16..=500,
        ) {
            let mut g = fresh();
            g.set_param(ATTENUATION_DB, db, smoothing);
            let input = vec![0.5_f32; block];
            let mut output = vec![0.0_f32; block];
            g.process(&input, &mut output);
            prop_assert_eq!(output.len(), input.len());
        }

        #[test]
        fn output_is_finite_for_bounded_input(
            xs in prop::collection::vec(-1.0_f32..=1.0, 1..=2048),
            db in -60.0f32..=6.0,
            smoothing in 0u16..=500,
        ) {
            let mut g = fresh();
            g.set_param(ATTENUATION_DB, db, smoothing);
            let mut output = vec![0.0_f32; xs.len()];
            g.process(&xs, &mut output);
            for (i, &y) in output.iter().enumerate() {
                prop_assert!(y.is_finite(), "output[{i}] = {y} is not finite");
            }
        }

        #[test]
        fn bypass_identity_within_1e6(
            xs in prop::collection::vec(-1.0_f32..=1.0, 1..=2048),
        ) {
            let mut g = fresh();
            g.set_param(ATTENUATION_DB, 0.0, 0);
            let mut output = vec![0.0_f32; xs.len()];
            g.process(&xs, &mut output);
            for (a, b) in xs.iter().zip(output.iter()) {
                prop_assert!((a - b).abs() < 1e-6);
            }
        }

        #[test]
        fn deterministic_for_same_input_sequence(
            xs in prop::collection::vec(-1.0_f32..=1.0, 1..=1024),
            db in -60.0f32..=6.0,
            smoothing in 0u16..=500,
        ) {
            let mut g1 = fresh();
            let mut g2 = fresh();
            g1.set_param(ATTENUATION_DB, db, smoothing);
            g2.set_param(ATTENUATION_DB, db, smoothing);
            let mut out1 = vec![0.0_f32; xs.len()];
            let mut out2 = vec![0.0_f32; xs.len()];
            g1.process(&xs, &mut out1);
            g2.process(&xs, &mut out2);
            prop_assert_eq!(out1, out2);
        }

        #[test]
        fn smoother_is_monotonic_between_targets(
            a_db in -60.0f32..=0.0,
            b_db in -60.0f32..=0.0,
            smoothing in 1u16..=200,
        ) {
            prop_assume!((a_db - b_db).abs() > 1e-3);
            let mut g = fresh();
            g.set_param(ATTENUATION_DB, a_db, 0);
            g.reset();
            g.set_param(ATTENUATION_DB, b_db, smoothing);

            let n = ((smoothing as u32 * SR / 1000) as usize).max(1);
            let input = vec![1.0_f32; n];
            let mut output = vec![0.0_f32; n];
            g.process(&input, &mut output);

            let ascending = b_db > a_db;
            for i in 1..output.len() {
                if ascending {
                    prop_assert!(output[i] + 1e-6 >= output[i - 1],
                        "expected non-decreasing at {i}: {} → {}", output[i - 1], output[i]);
                } else {
                    prop_assert!(output[i] - 1e-6 <= output[i - 1],
                        "expected non-increasing at {i}: {} → {}", output[i - 1], output[i]);
                }
            }

            let target = libm::powf(10.0, b_db / 20.0);
            for y in &output[(n.saturating_sub(1))..] {
                if ascending {
                    prop_assert!(*y <= target + 1e-3);
                } else {
                    prop_assert!(*y >= target - 1e-3);
                }
            }
        }
    }
}
