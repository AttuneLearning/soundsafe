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

pub mod transform;
pub mod transforms;

pub use transform::Transform;
