//! Soundsafe pack vault — AES-256-GCM decryption and key lifecycle.
//!
//! Per ADR-010: the pack key is held only in WASM linear memory inside a
//! `Zeroizing<[u8; 32]>` and is zeroed on `Drop` (pack unload). The
//! decryption path is streaming: plaintext is written into a caller-supplied
//! buffer, never returned as a fresh allocation in the hot path.
//!
//! Implementation lands in M1.

#![cfg_attr(not(test), no_std)]
