//! wasm-bindgen boundary coverage for rust-core (FS-ISS-007).
//!
//! Tests run under `wasm-pack test --node`. Plain Rust test coverage
//! of the internal `Engine` lives in `src/engine.rs`.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use js_sys::{Array, Object, Reflect, Uint8Array};
use sfx_test_fixtures::hello_pack;
use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

// Default when unconfigured is node mode; explicit configure attempts
// only matter for `run_in_browser`.

// --- sanity --------------------------------------------------------

#[wasm_bindgen_test]
fn version_is_non_empty() {
    assert!(!rust_core::version().is_empty());
}

#[wasm_bindgen_test]
fn init_is_idempotent() {
    rust_core::init();
    rust_core::init();
    rust_core::init();
}

// --- engine boot ---------------------------------------------------

fn boot() {
    let pk: [u8; 32] = [0xAA; 32];
    let arr = Uint8Array::from(&pk[..]);
    rust_core::engine_init(48_000, 128, &arr.to_vec()).expect("engine_init");
}

#[wasm_bindgen_test]
fn engine_init_rejects_wrong_pubkey_length() {
    let err = rust_core::engine_init(48_000, 128, &[0u8; 31]).expect_err("31 bytes should fail");
    assert!(err.is_string() || err.is_object());
}

/// Pre-init failure proof. Resets the engine, then proves every
/// stateful export returns the `NotInitialized` error path before
/// `engine_init` is called.
#[wasm_bindgen_test]
fn entries_fail_before_engine_init() {
    rust_core::__clear_engine_for_tests();
    rust_core::panic_stop().expect_err("panic_stop must fail before engine_init");
    rust_core::set_param(0, 1, -6.0, 20).expect_err("set_param must fail before engine_init");
    rust_core::poll_events().expect_err("poll_events must fail before engine_init");
    rust_core::process_block(&[0.0_f32; 128]).expect_err("process_block must fail before engine_init");
    rust_core::last_peak_dbfs().expect_err("last_peak_dbfs must fail before engine_init");
    rust_core::decrypted_file_count().expect_err("decrypted_file_count must fail before engine_init");

    // After init, the same calls succeed and panic_stop is idempotent.
    boot();
    rust_core::panic_stop().expect("panic_stop should succeed after engine_init");
    rust_core::panic_stop().expect("panic_stop should be idempotent");
}

// --- setPackKey zeroize proof (ADR-010) ----------------------------

#[wasm_bindgen_test]
fn set_pack_key_zeroes_source_uint8array() {
    boot();
    let key_bytes: [u8; 32] = [0x77; 32];
    let arr = Uint8Array::from(&key_bytes[..]);
    rust_core::set_pack_key(&arr).unwrap();
    // The caller's reference still points at the same Uint8Array; it
    // MUST be all zeros after the call returns (ADR-010 "≤ one
    // microtask on JS heap").
    let after = arr.to_vec();
    assert!(after.iter().all(|&b| b == 0), "key bytes not zeroed: {:?}", &after[..8]);
}

#[wasm_bindgen_test]
fn set_pack_key_enforces_32_bytes() {
    boot();
    let bad = Uint8Array::from(&[0u8; 31][..]);
    let err = rust_core::set_pack_key(&bad).expect_err("31-byte key must fail");
    assert!(err.is_string() || err.is_object());
}

// --- setParam idempotence / non-panic ------------------------------

#[wasm_bindgen_test]
fn set_param_round_trips() {
    boot();
    rust_core::set_param(0, 1, -6.0, 20).unwrap();
    rust_core::set_param(0, 2, 0.0, 0).unwrap();
}

// --- panic hook surfaces as JS exception ---------------------------

/// FS-ISS-007 boundary proof: a Rust panic surfaces as a JS exception.
///
/// `init()` installs `console_error_panic_hook`, which (a) prints the
/// panic message via `console.error` so the audio engine doesn't die
/// silently, and (b) lets the panic propagate so the wasm instance
/// aborts — the JS runtime then surfaces that abort as a runtime
/// exception. The visible proof is two-part: this test passes (the
/// panic reached the host runtime, satisfying `should_panic`), and
/// the wasm-pack runner's stderr shows `console_error_panic_hook::hook`
/// called with `soundsafe-test-panic-marker`, proving the hook ran
/// before the abort. We don't use `expected = "..."` because the hook
/// replaces wasm-bindgen-test's own panic-capture machinery, so the
/// matcher's view of the panic payload differs from the console output.
#[wasm_bindgen_test]
#[should_panic]
fn panic_surfaces_as_js_exception() {
    rust_core::init();
    rust_core::__panic_for_tests("soundsafe-test-panic-marker");
}

#[wasm_bindgen_test]
fn init_installs_panic_hook_idempotently() {
    rust_core::init();
    rust_core::init();
    rust_core::init();
    boot();
    rust_core::init();
}

// --- poll_events wire shape ----------------------------------------

#[wasm_bindgen_test]
fn poll_events_returns_valid_json() {
    boot();
    let json = rust_core::poll_events().unwrap();
    assert!(json.starts_with('['));
    assert!(json.ends_with(']'));
}

#[wasm_bindgen_test]
fn process_block_returns_block_sized_output() {
    boot();
    let input = vec![0.0_f32; 128];
    let out = rust_core::process_block(&input).unwrap();
    assert_eq!(out.len(), 128);
}

#[wasm_bindgen_test]
fn last_peak_dbfs_starts_at_minus_120() {
    boot();
    let db = rust_core::last_peak_dbfs().unwrap();
    assert!(db <= -119.0, "initial peak should be at or below -120, got {db}");
}

// --- composite loadPack drain path ---------------------------------

/// FS-ISS-007 acceptance criterion: prove the composite `loadPack` +
/// `decryptedFileCount` + `takeDecryptedFile` path the worker
/// (FS-ISS-009 / FS-ISS-012) consumes. Drives the boundary against
/// the deterministic `sfx-test-fixtures::hello_pack` AES-GCM +
/// Ed25519 round-trip and asserts the JS-visible behavior:
///   1. `loadPack` returns `Ok(())`.
///   2. The caller's `pack_key_bytes: Uint8Array` is zeroed in place.
///   3. `decryptedFileCount` reflects the manifest's file count.
///   4. `takeDecryptedFile` drains FIFO; payload contains the
///      base64-encoded plaintext for each file.
///   5. After draining, the count is zero and the next take is `None`.
#[wasm_bindgen_test]
fn load_pack_drains_decrypted_files() {
    rust_core::__clear_engine_for_tests();
    let pack = hello_pack(0);
    rust_core::engine_init(48_000, 128, &pack.public_key).expect("engine_init");

    // Build the encrypted-files JS array the wasm-bindgen surface
    // consumes. Shape per `loadPack` doc: array of
    // `{ path, ciphertext_b64, nonce_b64, tag_b64 }`.
    let arr = Array::new();
    for f in &pack.encrypted_files {
        let obj = Object::new();
        Reflect::set(&obj, &JsValue::from_str("path"), &JsValue::from_str(&f.path)).unwrap();
        Reflect::set(
            &obj,
            &JsValue::from_str("ciphertext_b64"),
            &JsValue::from_str(&B64.encode(&f.ciphertext)),
        )
        .unwrap();
        Reflect::set(
            &obj,
            &JsValue::from_str("nonce_b64"),
            &JsValue::from_str(&B64.encode(f.nonce)),
        )
        .unwrap();
        Reflect::set(
            &obj,
            &JsValue::from_str("tag_b64"),
            &JsValue::from_str(&B64.encode(f.tag)),
        )
        .unwrap();
        arr.push(&obj);
    }

    let pack_key_arr = Uint8Array::from(&pack.pack_key[..]);
    rust_core::load_pack(
        &pack.manifest_bytes,
        &pack.signature_bytes,
        arr.into(),
        &pack_key_arr,
    )
    .expect("loadPack should succeed against the hello pack");

    // (2) Pack key zeroed in place.
    let after = pack_key_arr.to_vec();
    assert!(after.iter().all(|&b| b == 0), "pack key bytes not zeroed");

    // (3) Decrypted file count matches the manifest.
    let count = rust_core::decrypted_file_count().expect("count");
    assert_eq!(count, pack.encrypted_files.len());

    // (4) Drain FIFO and decode.
    for expected in &pack.encrypted_files {
        let json = rust_core::take_decrypted_file()
            .expect("take")
            .expect("queue not empty");
        assert!(json.contains(&format!("\"path\":\"{}\"", expected.path)));
        // Round-trip the base64 plaintext back to bytes and compare.
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("json");
        let plaintext_b64 = parsed
            .get("plaintext_b64")
            .and_then(|v| v.as_str())
            .expect("plaintext_b64 field");
        let got = B64.decode(plaintext_b64).expect("base64 decodes");
        assert_eq!(&got, &expected.plaintext, "plaintext round-trip mismatch");
    }

    // (5) Drained.
    let after_count = rust_core::decrypted_file_count().expect("count2");
    assert_eq!(after_count, 0);
    let none = rust_core::take_decrypted_file().expect("take2");
    assert!(none.is_none());
}

// Suppress unused — the import is used for type coverage in
// `set_pack_key_zeroes_source_uint8array`.
fn _unused_jsvalue() -> JsValue { JsValue::NULL }
