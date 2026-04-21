//! Soundsafe audio graph runtime.
//!
//! Block-based DAG that chains `Transform`s (per step) and runs every
//! output through the always-on safety layers (ramp envelope + ceiling
//! limiter) from `sfx-safety`. Parameter changes arrive on a lock-free
//! SPSC-style ring (per ADR-020) and are drained at each block boundary.
//!
//! ## Invariants
//!
//! - **ADR-015: rails are required.** `AudioGraph::new` takes a bare
//!   `SafetyRails`, not `Option<SafetyRails>`. There is no API to
//!   disable the limiter or ramp. Every sample out of `process()` has
//!   been through both.
//! - **ADR-020: thread topology.** The param ring is single-producer
//!   (the AudioWorklet message handler) → single-consumer (`process()`).
//!   The backing store is `crossbeam_queue::ArrayQueue`, which is MPMC
//!   but satisfies the SPSC constraint trivially.
//! - **ADR-016: 128-frame quantum.** `AudioGraphConfig::BLOCK_SIZE_M1`
//!   pins the M1 block size to 128 to match
//!   `AudioWorkletProcessor.process()`.
//! - **Alloc-free hot path.** `process()` performs zero heap
//!   allocations. One scratch buffer is allocated in `new()` and
//!   reused for every block.

#![cfg_attr(not(test), no_std)]

extern crate alloc;

use alloc::boxed::Box;
use alloc::vec;
use alloc::vec::Vec;

use crossbeam_queue::ArrayQueue;
use sfx_dsp::Transform;
use sfx_safety::SafetyRails;

/// Number of entries in the parameter ring. 256 covers ~0.7 s of
/// sustained UI-knob traffic at a 44.1 kHz / 128-frame block cadence.
pub const PARAM_RING_CAPACITY: usize = 256;

/// Upper bound on messages drained per block. Caps the per-block cost
/// of parameter updates even under a burst of UI knob twiddles.
pub const MAX_DRAIN_PER_BLOCK: usize = 16;

/// Graph configuration.
#[derive(Debug, Clone, Copy)]
pub struct AudioGraphConfig {
    pub sample_rate: u32,
    pub block_size: usize,
}

impl AudioGraphConfig {
    /// The M1 block size (AudioWorkletProcessor quantum, per ADR-016).
    pub const BLOCK_SIZE_M1: usize = 128;

    pub const fn m1(sample_rate: u32) -> Self {
        Self { sample_rate, block_size: Self::BLOCK_SIZE_M1 }
    }
}

/// A single parameter update targeting a node in the transform chain.
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C)]
pub struct ParamMessage {
    pub node_id: u16,
    pub param_id: u16,
    pub value: f32,
    pub smoothing_ms: u16,
    _pad: [u8; 6],
}

impl ParamMessage {
    pub const fn new(node_id: u16, param_id: u16, value: f32, smoothing_ms: u16) -> Self {
        Self { node_id, param_id, value, smoothing_ms, _pad: [0; 6] }
    }
}

/// The parameter ring rejected a push because it was full.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RingFull;

/// Block-based audio graph. Construct via [`AudioGraph::new`].
pub struct AudioGraph {
    config: AudioGraphConfig,
    rails: SafetyRails,
    transforms: Vec<Box<dyn Transform>>,
    ring: ArrayQueue<ParamMessage>,
    scratch: Vec<f32>,
    ramp_samples_remaining: u32,
    ramp_total_samples: u32,
    ceiling_linear: f32,
}

impl AudioGraph {
    /// Construct a graph. `rails` is required; there is no `Option` by
    /// design (ADR-015).
    pub fn new(
        config: AudioGraphConfig,
        rails: SafetyRails,
        mut transforms: Vec<Box<dyn Transform>>,
    ) -> Self {
        for t in transforms.iter_mut() {
            t.prepare(config.sample_rate, config.block_size);
        }
        let ramp_total = Self::ramp_samples_for(&rails, config.sample_rate);
        let ceiling_linear = libm::powf(10.0, rails.ceiling().dbfs() / 20.0);
        let scratch = vec![0.0_f32; config.block_size.max(1)];
        Self {
            config,
            rails,
            transforms,
            ring: ArrayQueue::new(PARAM_RING_CAPACITY),
            scratch,
            ramp_samples_remaining: ramp_total,
            ramp_total_samples: ramp_total,
            ceiling_linear,
        }
    }

    fn ramp_samples_for(rails: &SafetyRails, sample_rate: u32) -> u32 {
        let ms = rails.ramp().ms() as u64;
        let rate = sample_rate as u64;
        ((ms * rate) / 1000) as u32
    }

    pub fn config(&self) -> AudioGraphConfig { self.config }
    pub fn rails(&self) -> SafetyRails { self.rails }
    pub fn transform_count(&self) -> usize { self.transforms.len() }

    /// Enqueue a parameter change. Returns `Err(RingFull)` if the ring
    /// has no free slot; M1 does not overwrite on full.
    pub fn enqueue_param(&self, msg: ParamMessage) -> Result<(), RingFull> {
        self.ring.push(msg).map_err(|_| RingFull)
    }

    /// Snap all transform smoothers to their targets and re-prime the
    /// ramp-up envelope.
    pub fn reset(&mut self) {
        for t in self.transforms.iter_mut() {
            t.reset();
        }
        self.ramp_samples_remaining = self.ramp_total_samples;
    }

    /// Run one block. Writes `min(input.len(), output.len(),
    /// scratch.len())` samples.
    ///
    /// Order (load-bearing, ADR-015): drain param ring → chain →
    /// ramp envelope → ceiling limiter.
    pub fn process(&mut self, input: &[f32], output: &mut [f32]) {
        for _ in 0..MAX_DRAIN_PER_BLOCK {
            let Some(msg) = self.ring.pop() else { break };
            let idx = msg.node_id as usize;
            if idx < self.transforms.len() {
                self.transforms[idx].set_param(msg.param_id, msg.value, msg.smoothing_ms);
            }
        }

        let n = input.len().min(output.len()).min(self.scratch.len());
        if n == 0 {
            return;
        }

        let transforms = &mut self.transforms;
        let scratch = &mut self.scratch;
        if transforms.is_empty() {
            output[..n].copy_from_slice(&input[..n]);
        } else {
            transforms[0].process(&input[..n], &mut output[..n]);
            for t in transforms.iter_mut().skip(1) {
                scratch[..n].copy_from_slice(&output[..n]);
                t.process(&scratch[..n], &mut output[..n]);
            }
        }

        if self.ramp_samples_remaining > 0 {
            let total_f = self.ramp_total_samples as f32;
            let total_u = self.ramp_total_samples;
            let mut remaining = self.ramp_samples_remaining;
            for out in output[..n].iter_mut() {
                if remaining == 0 {
                    break;
                }
                let elapsed = total_u - remaining + 1;
                let progress = (elapsed as f32) / total_f;
                let gain = if progress > 1.0 { 1.0 } else if progress < 0.0 { 0.0 } else { progress };
                *out *= gain;
                remaining -= 1;
            }
            self.ramp_samples_remaining = remaining;
        }

        let ceiling = self.ceiling_linear;
        for y in output[..n].iter_mut() {
            if *y > ceiling {
                *y = ceiling;
            } else if *y < -ceiling {
                *y = -ceiling;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use assert_no_alloc::assert_no_alloc;
    use sfx_dsp::transforms::gain::{self, Gain};
    use sfx_safety::{Ceiling, CoolDown, ExposureCap, RampUp, SafetyRails};

    #[global_allocator]
    static A: assert_no_alloc::AllocDisabler = assert_no_alloc::AllocDisabler;

    const SR: u32 = 48_000;

    fn rails_with_ramp_ms(ramp_ms: u32) -> SafetyRails {
        let ramp = RampUp::new(ramp_ms.max(RampUp::MIN_MS));
        SafetyRails::new(Ceiling::DEFAULT, ramp, ExposureCap::DEFAULT, CoolDown::DEFAULT)
    }

    fn make_graph_with_gain(ramp_ms: u32) -> AudioGraph {
        let rails = rails_with_ramp_ms(ramp_ms);
        let gain: Box<dyn Transform> = Box::new(Gain::new());
        AudioGraph::new(AudioGraphConfig::m1(SR), rails, vec![gain])
    }

    /// Cross-ramp smoothing helper: advance until the rails' ramp
    /// envelope is fully open, so downstream samples reflect only the
    /// transform chain + limiter.
    fn run_until_ramp_done(graph: &mut AudioGraph) {
        let block = AudioGraphConfig::BLOCK_SIZE_M1;
        let input = vec![0.0_f32; block];
        let mut output = vec![0.0_f32; block];
        while graph.ramp_samples_remaining > 0 {
            graph.process(&input, &mut output);
        }
    }

    #[test]
    fn rails_are_a_required_field() {
        // Compile-time: the constructor signature forbids missing rails.
        // This test is a behavioural smoke: the passed-in rails survive
        // verbatim through construction.
        let rails = rails_with_ramp_ms(500);
        let graph = AudioGraph::new(AudioGraphConfig::m1(SR), rails, vec![]);
        assert_eq!(graph.rails().ramp().ms(), 500);
    }

    #[test]
    fn chain_identity_small_input_post_ramp() {
        // Default rails have ramp = 3000 ms. Clamp to the smallest
        // permitted ramp (RampUp::MIN_MS = 250 ms) and advance past it.
        let mut graph = make_graph_with_gain(RampUp::MIN_MS);
        run_until_ramp_done(&mut graph);

        let input = vec![0.1_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        let mut output = vec![0.0_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        graph.process(&input, &mut output);
        for (a, b) in input.iter().zip(output.iter()) {
            assert!((a - b).abs() < 1e-5, "got {b}, want {a}");
        }
    }

    #[test]
    fn ceiling_respected_on_hot_input() {
        let mut graph = make_graph_with_gain(RampUp::MIN_MS);
        run_until_ramp_done(&mut graph);
        // Push gain up to +6 dB so the chain wants to clip.
        graph
            .enqueue_param(ParamMessage::new(0, gain::ATTENUATION_DB, 6.0, 0))
            .unwrap();
        let input = vec![0.95_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        let mut output = vec![0.0_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        graph.process(&input, &mut output);

        let ceiling_linear = libm::powf(10.0, Ceiling::DEFAULT.dbfs() / 20.0);
        for (i, y) in output.iter().enumerate() {
            assert!(
                y.abs() <= ceiling_linear + 1e-6,
                "sample {i} exceeded ceiling: |{y}| > {ceiling_linear}"
            );
        }
    }

    #[test]
    fn ramp_up_is_monotonic_0_to_full() {
        let ramp_ms = RampUp::MIN_MS; // 250 ms
        let mut graph = make_graph_with_gain(ramp_ms);
        let n_samples = (ramp_ms * SR / 1000) as usize;
        let blocks = (n_samples / AudioGraphConfig::BLOCK_SIZE_M1) + 2;

        let mut all = Vec::with_capacity(blocks * AudioGraphConfig::BLOCK_SIZE_M1);
        let input = vec![0.1_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        let mut output = vec![0.0_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        for _ in 0..blocks {
            graph.process(&input, &mut output);
            all.extend_from_slice(&output);
        }

        assert!(all[0] < 0.1 - 1e-4, "first sample {} must be below 0.1", all[0]);
        for i in 1..n_samples {
            assert!(
                all[i] + 1e-6 >= all[i - 1],
                "ramp non-monotonic at {i}: {} → {}",
                all[i - 1],
                all[i]
            );
        }
        for (i, y) in all.iter().enumerate().skip(n_samples + 1) {
            assert!((y - 0.1).abs() < 1e-5, "post-ramp sample {i} = {y}");
        }
    }

    #[test]
    fn smoother_between_gain_targets_is_monotonic() {
        let mut graph = make_graph_with_gain(RampUp::MIN_MS);
        run_until_ramp_done(&mut graph);

        // Snap to -20 dB, align smoother state via reset.
        graph
            .enqueue_param(ParamMessage::new(0, gain::ATTENUATION_DB, -20.0, 0))
            .unwrap();
        let input = vec![1.0_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        let mut output = vec![0.0_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        graph.process(&input, &mut output);
        graph.reset();
        run_until_ramp_done(&mut graph);

        graph
            .enqueue_param(ParamMessage::new(0, gain::ATTENUATION_DB, 0.0, 20))
            .unwrap();
        let n_samples = (20u32 * SR / 1000) as usize;
        let blocks = (n_samples / AudioGraphConfig::BLOCK_SIZE_M1) + 1;
        let mut all = Vec::with_capacity(blocks * AudioGraphConfig::BLOCK_SIZE_M1);
        for _ in 0..blocks {
            graph.process(&input, &mut output);
            all.extend_from_slice(&output);
        }

        for i in 1..n_samples {
            assert!(
                all[i] + 1e-6 >= all[i - 1],
                "smoother non-monotonic at {i}: {} → {}",
                all[i - 1],
                all[i]
            );
        }
    }

    #[test]
    fn ring_returns_ringfull_past_capacity() {
        let graph = make_graph_with_gain(RampUp::MIN_MS);
        for i in 0..PARAM_RING_CAPACITY {
            graph
                .enqueue_param(ParamMessage::new(0, gain::ATTENUATION_DB, i as f32 / 1000.0, 0))
                .unwrap();
        }
        for _ in 0..(300 - PARAM_RING_CAPACITY) {
            let err = graph
                .enqueue_param(ParamMessage::new(0, gain::ATTENUATION_DB, 0.0, 0))
                .unwrap_err();
            assert_eq!(err, RingFull);
        }
    }

    #[test]
    fn ring_accepts_again_after_drain() {
        let mut graph = make_graph_with_gain(RampUp::MIN_MS);
        for _ in 0..PARAM_RING_CAPACITY {
            graph
                .enqueue_param(ParamMessage::new(0, gain::ATTENUATION_DB, 0.0, 0))
                .unwrap();
        }
        let input = vec![0.0_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        let mut output = vec![0.0_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        graph.process(&input, &mut output);
        for _ in 0..MAX_DRAIN_PER_BLOCK {
            graph
                .enqueue_param(ParamMessage::new(0, gain::ATTENUATION_DB, 0.0, 0))
                .unwrap();
        }
    }

    #[test]
    fn process_is_allocation_free() {
        let mut graph = make_graph_with_gain(RampUp::MIN_MS);
        let input = vec![0.05_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        let mut output = vec![0.0_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        for _ in 0..8 {
            graph
                .enqueue_param(ParamMessage::new(0, gain::ATTENUATION_DB, -3.0, 10))
                .unwrap();
        }
        assert_no_alloc(|| {
            for _ in 0..10_000 {
                graph.process(&input, &mut output);
            }
        });
    }

    #[test]
    fn enqueue_from_shared_ref_is_allocation_free() {
        let graph = make_graph_with_gain(RampUp::MIN_MS);
        assert_no_alloc(|| {
            for i in 0..100 {
                let _ = graph.enqueue_param(ParamMessage::new(
                    0,
                    gain::ATTENUATION_DB,
                    -1.0 * i as f32 / 10.0,
                    0,
                ));
            }
        });
    }

    #[test]
    fn unknown_node_id_is_ignored() {
        let mut graph = make_graph_with_gain(RampUp::MIN_MS);
        graph.enqueue_param(ParamMessage::new(99, 0, 1.0, 0)).unwrap();
        let input = vec![0.1_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        let mut output = vec![0.0_f32; AudioGraphConfig::BLOCK_SIZE_M1];
        graph.process(&input, &mut output);
    }
}
