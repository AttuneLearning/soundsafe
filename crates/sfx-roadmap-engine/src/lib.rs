//! Soundsafe roadmap state machine.
//!
//! Pure Rust, no audio I/O. Owns step transitions, advance-condition
//! evaluation (Timer / UserTap / SudsBelow), and `SafetyBlock` propagation.
//! Lives inside the audio-worklet WASM instance (ADR-020) so step advance
//! is sample-accurate (ADR-022).
//!
//! Takes a `Clock` trait so tests can advance "time" deterministically
//! without spinning real audio. Implementation lands in M1 (single Timer
//! step) and M2 (full advance-condition set).

#![cfg_attr(not(test), no_std)]
