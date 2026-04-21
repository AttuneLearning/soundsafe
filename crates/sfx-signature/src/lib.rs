//! Soundsafe signature transforms.
//!
//! Houses the two product-differentiator transforms (ADR-016):
//! - **Extreme Pitch-Shift LFO** — oscillation speed (Hz), intensity (± semitones up to ±48), per-cycle duration (ms).
//! - **Binaural Beats generator** — carrier Hz, beat ΔHz, blend level.
//!
//! Implementations land in M2.

#![cfg_attr(not(test), no_std)]
