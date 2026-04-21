//! Reserved crate for therapist-plugin message signing/verification.
//!
//! v1 ships nothing (ADR-004). The crate exists so the workspace topology
//! at v2 is `v1 + content of this crate` rather than `v1 + a workspace
//! rename`. See GAP-008 (BAA surface) for the open questions that will
//! shape this crate's actual contents.

#![no_std]
