//! Soundsafe rust-core — the wasm-bindgen surface.
//!
//! The *only* WASM entry point in the workspace (per ADR-002 +
//! ADR-020). Its job is to construct the audio graph, the roadmap
//! engine, and the safety rails, and to bridge AudioWorklet messages
//! into the lock-free parameter ring.
//!
//! Implementation of the engine state machine lives in the sibling
//! [`engine`] module and is covered by plain `cargo nextest` tests.
//! This file is only the wasm-bindgen shim plus two small re-exports
//! so other workspace crates can depend on `rust_core::Engine`
//! directly.

extern crate alloc;

pub mod engine;

pub use engine::{Engine, EngineError, EventDto, ParamPairDto, StepDto, TransformSpecDto};

use alloc::string::String;
use std::cell::RefCell;

use wasm_bindgen::prelude::*;

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = const { RefCell::new(None) };
}

fn js_err<E: core::fmt::Display>(err: E) -> JsValue {
    JsValue::from_str(&alloc::format!("{err}"))
}

fn with_engine<F, R>(f: F) -> Result<R, JsValue>
where
    F: FnOnce(&mut Engine) -> Result<R, EngineError>,
{
    ENGINE.with(|cell| {
        let mut borrow = cell.borrow_mut();
        let engine = borrow
            .as_mut()
            .ok_or_else(|| js_err(EngineError::NotInitialized))?;
        f(engine).map_err(js_err)
    })
}

fn with_engine_ref<F, R>(f: F) -> Result<R, JsValue>
where
    F: FnOnce(&Engine) -> Result<R, EngineError>,
{
    ENGINE.with(|cell| {
        let borrow = cell.borrow();
        let engine = borrow
            .as_ref()
            .ok_or_else(|| js_err(EngineError::NotInitialized))?;
        f(engine).map_err(js_err)
    })
}

/// Idempotent panic-hook install. Safe to call before `engineInit`.
#[wasm_bindgen(js_name = init)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen(js_name = version)]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").into()
}

#[wasm_bindgen(js_name = engineInit)]
pub fn engine_init(
    sample_rate: u32,
    block_size: u32,
    bundled_public_key: &[u8],
) -> Result<(), JsValue> {
    init();
    let engine = Engine::new(sample_rate, block_size, bundled_public_key).map_err(js_err)?;
    ENGINE.with(|cell| *cell.borrow_mut() = Some(engine));
    Ok(())
}

#[wasm_bindgen(js_name = loadPackManifest)]
pub fn load_pack_manifest(
    manifest_bytes: &[u8],
    signature_bytes: &[u8],
) -> Result<String, JsValue> {
    with_engine(|engine| {
        let manifest = engine.load_pack_manifest(manifest_bytes, signature_bytes)?;
        Ok(manifest.pack_id.clone())
    })
}

/// Install the pack key from a JS-side `Uint8Array`. Per ADR-010,
/// WASM copies the bytes into a `Zeroizing<[u8; 32]>` vault and then
/// **immediately** calls `.fill(0)` on the JS-side buffer before
/// returning. The key never sits on the JS heap past one microtask.
#[wasm_bindgen(js_name = setPackKey)]
pub fn set_pack_key(pack_key_bytes: &js_sys::Uint8Array) -> Result<(), JsValue> {
    let bytes = pack_key_bytes.to_vec();
    let result = with_engine(|engine| engine.install_pack_key(&bytes));
    pack_key_bytes.fill(0, 0, pack_key_bytes.length());
    // Zero the transient heap copy before drop (the vault's Zeroizing
    // holds its own copy).
    let mut scratch = bytes;
    for b in scratch.iter_mut() { *b = 0; }
    drop(scratch);
    result
}

#[wasm_bindgen(js_name = clearPackKey)]
pub fn clear_pack_key() -> Result<(), JsValue> {
    with_engine(|engine| { engine.clear_pack_key(); Ok(()) })
}

#[wasm_bindgen(js_name = decryptFile)]
pub fn decrypt_file(
    ciphertext: &[u8],
    nonce: &[u8],
    tag: &[u8],
) -> Result<alloc::vec::Vec<u8>, JsValue> {
    with_engine_ref(|engine| engine.decrypt_file(ciphertext, nonce, tag))
}

#[wasm_bindgen(js_name = playStep)]
pub fn play_step(step_json: &str) -> Result<(), JsValue> {
    with_engine(|engine| engine.play_step(step_json))
}

/// Load a multi-step roadmap from JSON.
#[wasm_bindgen(js_name = loadRoadmap)]
pub fn load_roadmap(roadmap_json: &str) -> Result<(), JsValue> {
    with_engine(|engine| engine.load_roadmap(roadmap_json))
}

/// Composite pack loader matching the FS-ISS-007 spec entry point:
/// verify manifest → install pack key (zeroized on return) → decrypt
/// every file → return decrypted bytes (base64 in a JSON string the
/// TS side parses). Issued from the decrypt worker.
#[wasm_bindgen(js_name = loadPack)]
pub fn load_pack(
    manifest_bytes: &[u8],
    signature_bytes: &[u8],
    pack_key_bytes: &js_sys::Uint8Array,
    encrypted_files_json: &str,
) -> Result<String, JsValue> {
    let bytes = pack_key_bytes.to_vec();
    let result = with_engine(|engine| {
        engine.load_pack(manifest_bytes, signature_bytes, &bytes, encrypted_files_json)
    });
    // ADR-010: zero the JS-side buffer immediately. The transient Rust
    // copy and the vault's copy are Zeroize-dropped.
    pack_key_bytes.fill(0, 0, pack_key_bytes.length());
    let mut scratch = bytes;
    for b in scratch.iter_mut() { *b = 0; }
    drop(scratch);
    let decrypted = result?;
    serde_json::to_string(&decrypted)
        .map_err(|e| JsValue::from_str(&alloc::format!("json encode: {e}")))
}

/// Most recent post-limiter peak in dBFS. Surfaces `-120.0` for
/// effectively-silent output so the wire format stays finite.
#[wasm_bindgen(js_name = lastPeakDbfs)]
pub fn last_peak_dbfs() -> Result<f32, JsValue> {
    with_engine_ref(|engine| Ok(engine.last_peak_dbfs()))
}

#[wasm_bindgen(js_name = setParam)]
pub fn set_param(
    node_id: u16,
    param_id: u16,
    value: f32,
    smoothing_ms: u16,
) -> Result<(), JsValue> {
    with_engine_ref(|engine| engine.set_param(node_id, param_id, value, smoothing_ms))
}

#[wasm_bindgen(js_name = panicStop)]
pub fn panic_stop() -> Result<(), JsValue> {
    with_engine(|engine| { engine.panic_stop(); Ok(()) })
}

#[wasm_bindgen(js_name = pollEvents)]
pub fn poll_events() -> Result<String, JsValue> {
    with_engine(|engine| Ok(engine.poll_events_json()))
}

#[wasm_bindgen(js_name = processBlock)]
pub fn process_block(input: &[f32]) -> Result<alloc::vec::Vec<f32>, JsValue> {
    with_engine(|engine| {
        let block = engine.config().block_size;
        let mut output = alloc::vec![0.0_f32; block];
        engine.process_block(input, &mut output);
        Ok(output)
    })
}

// The wasm-bindgen free functions produce JsValue, which only has a
// working runtime implementation under the `wasm32` target. Native
// cargo tests exercise the `engine` module directly; wasm-bindgen
// boundary tests live in `tests/sanity.rs` and run under
// `wasm-pack test`.
