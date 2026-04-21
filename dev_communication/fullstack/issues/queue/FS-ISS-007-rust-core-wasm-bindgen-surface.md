# FS-ISS-007: rust-core wasm-bindgen surface

**Priority:** High
**Status:** QUEUE
**QA:** PENDING
**Created:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.6)
**Assigned To:** Fullstack-Dev

## Description

The `rust-core` crate (at `packages/rust-core/`) is the only WASM entry point in the workspace (per ADR-002, ADR-020). This phase fleshes out the wasm-bindgen surface so the TypeScript bridge (M1.7) has something to drive: `engineInit`, `loadPack`, `playStep`, `panicStop`, `setParam`, plus the minimal wasm-bindgen-test coverage that CI's WASM job expects.

Per ADR-010, the pack key handoff from JS to WASM is the most security-critical path in the app. M1.6 implements the handoff's Rust side and adds a wasm-bindgen-test that asserts the JS-side `Uint8Array` is zeroed after the key crosses into WASM linear memory.

## Acceptance Criteria

- [ ] `engineInit(sample_rate: u32, block_size: u32, bundled_public_key: &[u8])` — one-shot entry called from JS at app startup. Constructs the `AudioGraph` (with `SafetyRails::defaults()` per M0) and the `RoadmapRunner` (empty — ready for `playStep`). Stores the bundled Ed25519 public key for later `loadPack` verification. Installs the panic hook (already present from M0). Returns `Result<(), JsError>` surfaced as a JS exception.
- [ ] `loadPack(manifest_bytes: &[u8], signature_bytes: &[u8], encrypted_files: JsValue, pack_key_bytes: Uint8Array) -> Result<(), JsError>`:
  1. Calls `sfx_pack_manifest::verify_and_parse` using the bundled public key from `engineInit`. On failure, returns the ManifestError as a JsError.
  2. Constructs a `PackVault` from `pack_key_bytes`. **Immediately** calls a JS-side `pack_key_bytes.fill(0)` before returning. The ADR-010 "≤ one microtask on JS heap" rule is honored by never holding a reference to `pack_key_bytes` after this function returns.
  3. Decrypts each file from `encrypted_files` into OPFS via the `PackVault` (the actual OPFS write happens in the decrypt worker, so here we just hold decrypted bytes in WASM linear memory and emit a handle).
- [ ] `playStep(step_json: &str) -> Result<(), JsError>` — parses a JSON step definition (matching M1.5's `Step` type), enqueues it into the `RoadmapRunner`, and triggers the audio graph's ring to switch transforms.
- [ ] `panicStop()` — sets an atomic flag. The `AudioGraph::process()` reads this flag at the next block boundary and begins the 500 ms fade (via `sfx-safety::panic_fade`). Returns immediately (non-blocking).
- [ ] `setParam(node_id: u32, param_id: u16, value: f32, smoothing_ms: u16)` — enqueues a `ParamMessage` into the audio graph's ring. Returns `Result<(), JsError>` where `Err(RingFull)` is the only failure mode.
- [ ] `version()` (already present from M0) — stays.
- [ ] wasm-bindgen-tests at `packages/rust-core/tests/m1_boundary.rs`:
  - Each exported function is callable and returns the expected type (existence tests).
  - `panicStop()` is idempotent — calling it twice in a row is safe.
  - `setParam` does not allocate once the engine is initialized (boundary test; full alloc-free-ness is tested in `sfx-audio-graph`).
  - Byte round-trip: a known `Uint8Array` passed as `pack_key_bytes` decodes to the same bytes inside Rust (sanity check on the wasm-bindgen Uint8Array → &[u8] conversion).
  - Key zeroize evidence: after `loadPack` returns, the JS-side `Uint8Array` used for `pack_key_bytes` is all zeros. (This is testable because JS-side test code retains a reference to inspect it post-call.)
  - Rust panic surfaces as a JS exception with the `console_error_panic_hook` message (so audio doesn't silently die).
- [ ] `wasm-pack build packages/rust-core --target web --out-dir pkg` succeeds.
- [ ] `wasm-pack test --node packages/rust-core` green.

## Notes

- This is the first phase that touches wasm-bindgen meaningfully. The M0 stub was just `init()` + `version()`.
- The `encrypted_files: JsValue` shape needs definition — probably an array of `{ path: string, ciphertext: Uint8Array, nonce: Uint8Array, tag: Uint8Array, plaintext_len: number }`. Use `serde_wasm_bindgen` or hand-parse via `js_sys::Array`.
- For the ring and runner, hold them as `thread_local!` statics inside `rust-core` since wasm-bindgen exports free functions. Each function dereferences the thread-local. (WASM has a single JS execution context per instance so `thread_local!` is safe.)
- The TS-side call pattern is owned by M1.7 (`audio-graph-ts`). This phase exposes the surface; M1.7 consumes it.

## Dependencies

- **M1.1 (FS-ISS-002)** — `verify_and_parse` used in `loadPack`.
- **M1.2 (FS-ISS-003)** — `PackVault` used in `loadPack`.
- **M1.4 (FS-ISS-005)** — `AudioGraph` used in `engineInit` and driven by `setParam`, `panicStop`.
- **M1.5 (FS-ISS-006)** — `RoadmapRunner` used in `playStep`.

All four upstream phases must be in `completed/` before this one starts.

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`cargo check --workspace`)
- [ ] Unit tests passed (`cargo nextest run -p rust-core`)
- [ ] Integration tests passed (`wasm-pack test --node packages/rust-core`)
- [ ] UAT tests passed (n/a — consumed by M1.7, not by users directly)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
