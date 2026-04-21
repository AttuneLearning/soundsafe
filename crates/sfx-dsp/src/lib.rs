//! Soundsafe DSP primitives.
//!
//! Houses the `Transform` trait and the non-signature transforms enumerated
//! in ADR-016 (gain envelope, low-pass, high-pass, parametric EQ, spectral
//! softening, pink-noise masking, time stretch, reversal, partial mute /
//! zoning). Signature transforms live in `sfx-signature`.
//!
//! All `process` paths must be allocation-free in the audio callback.

#![cfg_attr(not(test), no_std)]
#![allow(clippy::needless_doctest_main)]

extern crate alloc;

/// Marker for a real-time-safe DSP transform. Stub for M0 — the trait
/// surface (prepare / set_param / process / reset / serialize_params) is
/// added in M1 alongside the first transform implementation (Gain envelope).
pub trait Transform {
    /// Returns the transform's stable identifier — used in roadmap JSON.
    fn id(&self) -> &'static str;
}
