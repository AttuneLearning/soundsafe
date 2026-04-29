# Re-handoff: FS-ISS-007 take 5

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-29
**In-Response-To:** FS-ISS-007

## Findings addressed

Direct wasm-boundary proofs for the three QA-flagged gaps from the
2026-04-29T21:14:19Z review (no narrowing):

1. **Pre-init failure proof.** `entries_fail_before_engine_init` now
   calls a new `__clearEngineForTests()` debug-gated export and
   asserts `panic_stop`, `set_param`, `poll_events`, `process_block`,
   `last_peak_dbfs`, and `decrypted_file_count` each return the
   `NotInitialized` error variant. After `engine_init`, the same
   calls succeed and `panic_stop` is idempotent.

2. **Panic-to-JS exception surface.** New
   `panic_surfaces_as_js_exception` (`#[should_panic]`) test calls a
   new `__panicForTests(msg)` debug-gated export that triggers a
   real Rust panic with the marker `soundsafe-test-panic-marker`.
   Two-part proof: `should_panic` matches → process aborted (JS
   sees `RuntimeError`); the wasm-pack runner stderr shows
   `console_error_panic_hook::hook` called with the marker → hook
   surfaced the message before the abort.

3. **Composite `loadPack` + drain path.**
   `load_pack_drains_decrypted_files` drives the boundary against
   `sfx_test_fixtures::hello_pack(0)`'s real AES-256-GCM + Ed25519
   round-trip. Builds the encrypted-files JS array via
   `js_sys::Reflect::set` + `Object.new` + `Array.new`, calls
   `loadPack(...)`, asserts `Result<(), JsError> = Ok(())`, asserts
   the caller's `Uint8Array` pack-key buffer is zeroed in place
   (ADR-010), drains via `decryptedFileCount()` + `takeDecryptedFile()`,
   and compares each plaintext byte-for-byte against the fixture.

The two test-utility exports are gated on `cfg(debug_assertions)` so
production `wasm-pack build --release` artifacts don't ship them.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass
- `wasm-pack build packages/rust-core --target web --out-dir pkg` → ok
- `wasm-pack test --node packages/rust-core` → **13/13 pass** (was 11)
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 45 vitest tests pass
- `pnpm schema:check` → up to date

- Files: `packages/rust-core/src/lib.rs`, `packages/rust-core/tests/sanity.rs`.
- Commit: `0efb04d` ("Take-5 unblock: FS-ISS-007 wasm-bindgen tests + FS-ISS-010/011 engine boot")
- Push: pushed to `origin/main` as commit `0efb04d` on 2026-04-29.
