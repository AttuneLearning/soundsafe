//! Soundsafe roadmap state machine.
//!
//! Pure Rust, no audio I/O. Owns step transitions, advance-condition
//! evaluation (Timer in M1; `UserTap` / `SudsBelow` land in M2), and
//! `SafetyBlock` propagation.
//!
//! The engine lives inside the audio-worklet WASM instance (ADR-020)
//! so step advance is sample-accurate (ADR-022). It does not touch
//! audio samples itself — it consults a [`Clock`] trait that exposes
//! a monotonically increasing sample count.
//!
//! No `std::thread`, no `tokio`, no I/O. The crate is `no_std`-safe
//! with `extern crate alloc`.

#![cfg_attr(not(test), no_std)]

extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;

pub use sfx_safety::SafetyBlock;

pub mod clock;

pub use clock::{Clock, FakeClock, SampleCounterClock};

/// Transform-spec placeholder. The concrete shape is owned by
/// `sfx-pack-manifest`'s pack-roadmap format; M1 keeps it minimal to
/// avoid coupling.
#[derive(Debug, Clone, PartialEq)]
pub struct TransformSpec {
    pub kind: String,
    pub params: Vec<(u16, f32)>,
}

/// Advance condition for a roadmap step. M1 ships `Timer`; the other
/// variants are reserved for M2.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdvanceCondition {
    Timer { ms: u32 },
}

/// A single step in a roadmap.
#[derive(Debug, Clone, PartialEq)]
pub struct Step {
    pub source_id: String,
    pub transforms: Vec<TransformSpec>,
    pub duration_ms: u32,
    pub advance: AdvanceCondition,
}

/// A complete roadmap.
#[derive(Debug, Clone, PartialEq)]
pub struct Roadmap {
    pub id: String,
    pub steps: Vec<Step>,
}

/// External user / safety input to the runner.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunnerInput {
    /// Latched via the panic-stop UI gesture. The runner always honors
    /// this within one tick (ADR-015 non-bypassable).
    PanicStop,
    /// User-tap input for M2 `UserTap` advance condition. M1 stores it
    /// for round-trip but does not act on it.
    Tap,
    /// Self-reported SUDS rating (0–10). M2 `SudsBelow` will consult it.
    Suds(u8),
    /// Safety subsystem reports an active block. M1 surfaces it as a
    /// `SafetyBlocked` event without attempting to recover.
    Safety(SafetyBlock),
}

/// Events emitted by the runner. The audio graph / WASM surface
/// consumes these to drive UI and playback transitions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoadmapEvent {
    StepStarted(u16),
    StepCompleted(u16),
    RoadmapCompleted,
    PanicStopRequested,
    PanicFadeComplete,
    SafetyBlocked(SafetyBlock),
}

/// Runner state. Exposed for diagnostics; transitions happen inside
/// `tick()` / `input()`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunnerState {
    Idle,
    Running { index: u16, started_at_samples: u64 },
    PanicStopping { requested_at_samples: u64 },
    Done,
}

/// Duration of the panic-stop fade before `PanicFadeComplete` is
/// emitted. 250 ms matches the minimum `RampUp::MIN_MS` from
/// `sfx-safety`.
pub const PANIC_FADE_MS: u32 = 250;

/// Drives a `Roadmap` against a `Clock`.
#[derive(Debug)]
pub struct RoadmapRunner<C: Clock> {
    roadmap: Roadmap,
    clock: C,
    state: RunnerState,
    events: Vec<RoadmapEvent>,
    sample_rate: u32,
}

impl<C: Clock> RoadmapRunner<C> {
    pub fn new(roadmap: Roadmap, clock: C, sample_rate: u32) -> Self {
        Self {
            roadmap,
            clock,
            state: RunnerState::Idle,
            events: Vec::new(),
            sample_rate: sample_rate.max(1),
        }
    }

    pub fn state(&self) -> RunnerState { self.state }
    pub fn clock(&self) -> &C { &self.clock }
    pub fn clock_mut(&mut self) -> &mut C { &mut self.clock }
    pub fn roadmap(&self) -> &Roadmap { &self.roadmap }

    pub fn input(&mut self, input: RunnerInput) {
        match input {
            RunnerInput::PanicStop => {
                if !matches!(self.state, RunnerState::PanicStopping { .. } | RunnerState::Done) {
                    let now = self.clock.processed_samples();
                    self.state = RunnerState::PanicStopping { requested_at_samples: now };
                    self.events.push(RoadmapEvent::PanicStopRequested);
                }
            }
            RunnerInput::Safety(block) => {
                self.events.push(RoadmapEvent::SafetyBlocked(block));
            }
            RunnerInput::Tap | RunnerInput::Suds(_) => {}
        }
    }

    pub fn tick(&mut self) {
        let now = self.clock.processed_samples();
        match self.state {
            RunnerState::Idle => {
                if self.roadmap.steps.is_empty() {
                    self.state = RunnerState::Done;
                    self.events.push(RoadmapEvent::RoadmapCompleted);
                } else {
                    self.state = RunnerState::Running { index: 0, started_at_samples: now };
                    self.events.push(RoadmapEvent::StepStarted(0));
                }
            }
            RunnerState::Running { index, started_at_samples } => {
                let step = &self.roadmap.steps[index as usize];
                let AdvanceCondition::Timer { ms } = step.advance;
                let target = ms_to_samples(ms, self.sample_rate);
                let elapsed = now.saturating_sub(started_at_samples);
                if elapsed >= target {
                    self.events.push(RoadmapEvent::StepCompleted(index));
                    let next = index + 1;
                    if (next as usize) < self.roadmap.steps.len() {
                        self.state = RunnerState::Running { index: next, started_at_samples: now };
                        self.events.push(RoadmapEvent::StepStarted(next));
                    } else {
                        self.state = RunnerState::Done;
                        self.events.push(RoadmapEvent::RoadmapCompleted);
                    }
                }
            }
            RunnerState::PanicStopping { requested_at_samples } => {
                let fade = ms_to_samples(PANIC_FADE_MS, self.sample_rate);
                let elapsed = now.saturating_sub(requested_at_samples);
                if elapsed >= fade {
                    self.state = RunnerState::Done;
                    self.events.push(RoadmapEvent::PanicFadeComplete);
                }
            }
            RunnerState::Done => {}
        }
    }

    pub fn poll_events(&mut self) -> Vec<RoadmapEvent> {
        core::mem::take(&mut self.events)
    }
}

fn ms_to_samples(ms: u32, sample_rate: u32) -> u64 {
    (ms as u64).saturating_mul(sample_rate as u64) / 1000
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::string::ToString;
    use alloc::vec;
    use proptest::prelude::*;

    const SR: u32 = 48_000;

    fn one_step_timer_roadmap(duration_ms: u32) -> Roadmap {
        Roadmap {
            id: "hello".to_string(),
            steps: vec![Step {
                source_id: "dog-bark".to_string(),
                transforms: vec![TransformSpec {
                    kind: "gain".to_string(),
                    params: vec![(1, -12.0)],
                }],
                duration_ms,
                advance: AdvanceCondition::Timer { ms: duration_ms },
            }],
        }
    }

    #[test]
    fn idle_then_tick_emits_step_started_zero() {
        let mut runner = RoadmapRunner::new(one_step_timer_roadmap(1000), FakeClock::new(), SR);
        runner.tick();
        assert_eq!(runner.poll_events(), vec![RoadmapEvent::StepStarted(0)]);
    }

    #[test]
    fn timer_completes_when_elapsed_samples_hit_target() {
        let mut runner = RoadmapRunner::new(one_step_timer_roadmap(1000), FakeClock::new(), SR);
        runner.tick();
        runner.clock_mut().advance_samples(SR as u64);
        runner.tick();
        assert_eq!(
            runner.poll_events(),
            vec![
                RoadmapEvent::StepStarted(0),
                RoadmapEvent::StepCompleted(0),
                RoadmapEvent::RoadmapCompleted,
            ]
        );
        assert_eq!(runner.state(), RunnerState::Done);
    }

    #[test]
    fn panic_stop_requested_within_one_tick() {
        let mut runner = RoadmapRunner::new(one_step_timer_roadmap(60_000), FakeClock::new(), SR);
        runner.tick();
        runner.input(RunnerInput::PanicStop);
        let events = runner.poll_events();
        assert!(events.contains(&RoadmapEvent::PanicStopRequested));
        runner.clock_mut().advance_samples(ms_to_samples(PANIC_FADE_MS, SR));
        runner.tick();
        assert_eq!(runner.poll_events(), vec![RoadmapEvent::PanicFadeComplete]);
        assert_eq!(runner.state(), RunnerState::Done);
    }

    #[test]
    fn empty_roadmap_completes_immediately() {
        let roadmap = Roadmap { id: "empty".to_string(), steps: vec![] };
        let mut runner = RoadmapRunner::new(roadmap, FakeClock::new(), SR);
        runner.tick();
        assert_eq!(runner.poll_events(), vec![RoadmapEvent::RoadmapCompleted]);
    }

    #[test]
    fn canonical_60s_timer_snapshot() {
        let mut runner = RoadmapRunner::new(one_step_timer_roadmap(60_000), FakeClock::new(), SR);
        let mut trace = Vec::new();

        runner.tick();
        for ev in runner.poll_events() {
            trace.push((runner.clock().processed_samples(), ev));
        }

        runner.clock_mut().advance_samples(60u64 * SR as u64);
        runner.tick();
        for ev in runner.poll_events() {
            trace.push((runner.clock().processed_samples(), ev));
        }

        assert_eq!(
            trace,
            vec![
                (0, RoadmapEvent::StepStarted(0)),
                (2_880_000, RoadmapEvent::StepCompleted(0)),
                (2_880_000, RoadmapEvent::RoadmapCompleted),
            ]
        );
    }

    #[test]
    fn multi_step_roadmap_progresses_in_order() {
        let roadmap = Roadmap {
            id: "multi".to_string(),
            steps: vec![
                Step {
                    source_id: "a".to_string(),
                    transforms: vec![],
                    duration_ms: 500,
                    advance: AdvanceCondition::Timer { ms: 500 },
                },
                Step {
                    source_id: "b".to_string(),
                    transforms: vec![],
                    duration_ms: 500,
                    advance: AdvanceCondition::Timer { ms: 500 },
                },
            ],
        };
        let mut runner = RoadmapRunner::new(roadmap, FakeClock::new(), SR);
        runner.tick();
        runner.clock_mut().advance_samples(ms_to_samples(500, SR));
        runner.tick();
        runner.clock_mut().advance_samples(ms_to_samples(500, SR));
        runner.tick();
        assert_eq!(
            runner.poll_events(),
            vec![
                RoadmapEvent::StepStarted(0),
                RoadmapEvent::StepCompleted(0),
                RoadmapEvent::StepStarted(1),
                RoadmapEvent::StepCompleted(1),
                RoadmapEvent::RoadmapCompleted,
            ]
        );
    }

    #[test]
    fn tap_and_suds_inputs_are_no_ops_in_m1() {
        let mut runner = RoadmapRunner::new(one_step_timer_roadmap(1000), FakeClock::new(), SR);
        runner.input(RunnerInput::Tap);
        runner.input(RunnerInput::Suds(5));
        assert!(runner.poll_events().is_empty());
    }

    #[test]
    fn safety_input_surfaces_as_event() {
        let mut runner = RoadmapRunner::new(one_step_timer_roadmap(1000), FakeClock::new(), SR);
        let block = SafetyBlock::DisclaimerNotAcknowledged;
        runner.input(RunnerInput::Safety(block));
        assert_eq!(runner.poll_events(), vec![RoadmapEvent::SafetyBlocked(block)]);
    }

    proptest! {
        #[test]
        fn well_formed_event_log_under_arbitrary_interleaving(
            step_durations in proptest::collection::vec(50u32..=5_000, 1..=5),
            tick_advances_ms in proptest::collection::vec(0u32..=6_000, 0..=30),
            panic_at in proptest::option::of(0usize..=30),
        ) {
            let roadmap = Roadmap {
                id: "prop".to_string(),
                steps: step_durations.iter().map(|&ms| Step {
                    source_id: "s".to_string(),
                    transforms: vec![],
                    duration_ms: ms,
                    advance: AdvanceCondition::Timer { ms },
                }).collect(),
            };
            let mut runner = RoadmapRunner::new(roadmap.clone(), FakeClock::new(), SR);
            let mut trace: Vec<RoadmapEvent> = Vec::new();
            let mut panicked = false;

            for (i, dt_ms) in tick_advances_ms.iter().enumerate() {
                if Some(i) == panic_at && !panicked {
                    runner.input(RunnerInput::PanicStop);
                    panicked = true;
                }
                runner.clock_mut().advance_samples(ms_to_samples(*dt_ms, SR));
                runner.tick();
                trace.extend(runner.poll_events());
                if matches!(runner.state(), RunnerState::Done) {
                    break;
                }
            }

            // Force termination: large advances until Done or budget exceeded.
            for _ in 0..roadmap.steps.len() + 4 {
                runner.clock_mut().advance_samples(ms_to_samples(10_000, SR));
                runner.tick();
                trace.extend(runner.poll_events());
                if matches!(runner.state(), RunnerState::Done) {
                    break;
                }
            }

            prop_assert_eq!(runner.state(), RunnerState::Done);

            // Invariants: StepCompleted(i) only after StepStarted(i);
            // StepStarted(i+1) only after StepCompleted(i).
            let mut last_started: Option<u16> = None;
            let mut last_completed: Option<u16> = None;
            for ev in &trace {
                match ev {
                    RoadmapEvent::StepStarted(i) => {
                        if let Some(prev) = last_completed {
                            prop_assert_eq!(*i, prev + 1,
                                "step {} started out of order after completing {}", i, prev);
                        } else {
                            prop_assert_eq!(*i, 0,
                                "first StepStarted should be index 0, got {}", i);
                        }
                        last_started = Some(*i);
                    }
                    RoadmapEvent::StepCompleted(i) => {
                        prop_assert_eq!(Some(*i), last_started,
                            "StepCompleted({}) without matching StepStarted", i);
                        last_completed = Some(*i);
                    }
                    _ => {}
                }
            }

            if panicked {
                prop_assert!(
                    trace.iter().any(|e| matches!(e, RoadmapEvent::PanicStopRequested)),
                    "PanicStop input did not produce PanicStopRequested event"
                );
            }
        }
    }
}
