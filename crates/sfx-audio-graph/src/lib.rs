//! Soundsafe audio graph runtime.
//!
//! Block-based DAG that schedules `Transform`s in a chain (per step) plus a
//! master bus. Parameter changes arrive on a lock-free SPSC ring (per
//! ADR-020) and are applied through `atomic_float` smoothers at the next
//! audio block boundary.
//!
//! `SafetyRails` (from `sfx-safety`) is a required field of `AudioGraph` —
//! ADR-015's "never disabled" property is enforced at the type level.
//!
//! Block size matches the AudioWorkletProcessor quantum (128 frames).
//!
//! Implementation lands in M1 (single-step gain chain) and M2 (full chain).
