//! Soundsafe rust-core — the wasm-bindgen surface.
//!
//! This crate is the *only* WASM entry point (per ADR-002 + ADR-020). Its
//! job is to construct the audio graph, the roadmap engine, and the safety
//! rails, and to bridge AudioWorklet messages into the lock-free parameter
//! ring. It contains no logic of its own — every responsibility lives in a
//! dedicated `sfx-*` crate.
//!
//! M0 ships an `init` entry that installs the panic hook so a Rust panic
//! during early bring-up surfaces as a JS exception rather than a silent
//! audio failure. Real engine wiring lands in M1.

use wasm_bindgen::prelude::*;

/// Initialise the WASM module. Idempotent.
///
/// Called once at app startup from `audio-graph-ts`. Installs the panic
/// hook so subsequent panics surface as JS exceptions (ADR-018 boundary
/// hygiene).
#[wasm_bindgen(js_name = init)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Returns the package version (compile-time). Useful for the consumer app
/// to log which `rust-core` build is loaded.
#[wasm_bindgen(js_name = version)]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
