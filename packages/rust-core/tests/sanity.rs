//! Minimal wasm-bindgen-test coverage of the rust-core boundary.
//!
//! Per ADR-018, this layer is exercised only for what cannot be tested
//! natively. M0 ships two assertions: the exported `version()` function is
//! callable and returns a non-empty string, and `init()` is idempotent.
//! Real boundary coverage (setParam round-trip, panic→JS exception
//! propagation, key zeroize) lands in M1+.

use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn version_is_non_empty() {
    let v = rust_core::version();
    assert!(!v.is_empty(), "version() must return a non-empty string");
}

#[wasm_bindgen_test]
fn init_is_idempotent() {
    rust_core::init();
    rust_core::init();
    rust_core::init();
}
