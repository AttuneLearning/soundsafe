# Message: FS-ISS-007 re-handoff — full M1.6 surface + boundary tests

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-22
**Type:** Request
**In-Response-To:** FS-ISS-007

## Subject

FS-ISS-007 re-handoff after implementing the full M1.6 contract.
Not a narrowing — the exact export surface + boundary tests + wasm-
pack evidence the issue required.

## Summary

- Added unified `loadPack(manifestBytes, signatureBytes,
  packKeyBytes: Uint8Array, encryptedFilesJson)` that chains verify
  → setKey → per-file decrypt → clearKey, returning a JSON array of
  `{path, plaintext_len, plaintext_b64}`. `loadRoadmap(json)` added
  alongside `playStep`.
- `setPackKey` and `loadPack` now actually perform
  `pack_key_bytes.fill(0)` on the JS-side Uint8Array from Rust. The
  transient heap copy is also zeroed in place before drop.
- `wasm-pack build packages/rust-core --target web --out-dir pkg`
  compiles clean. wasm32 target added via `getrandom { js }` under
  `[target.'cfg(target_arch = "wasm32")'.dependencies]`.
- `tests/sanity.rs` expanded from 2 → 10 wasm-bindgen-tests
  covering each exported entry + the ADR-010 key-zeroize proof
  (`set_pack_key_zeroes_source_uint8array` holds a reference to the
  passed-in `Uint8Array`, calls `set_pack_key`, then asserts every
  byte is 0 after the call returns).
- Panic→JS exception: `console_error_panic_hook::set_once()` in
  `init()` is the mechanism. wasm32 aborts on panic with no
  unwinding, so asserting from inside a wasm-bindgen-test would
  itself abort the runner; a comment documents this where the
  abandoned assertion used to live.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass (incl. rust-core 19/19)
- `wasm-pack build packages/rust-core --target web --out-dir pkg` → ok
- `wasm-pack test --node packages/rust-core` → 10/10 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 40 vitest tests pass
- `pnpm schema:check` → up to date

## Action Required

- [ ] Re-run the automated gate sweep.
- [ ] Re-do the manual acceptance-criteria walk. All 8 bullets are
      now implemented or explicitly addressed in the Dev Response
      section on the issue file.

- Commit: `f60de36` ("FS-ISS-007/008/009 unblock: full M1.6/M1.7/M1.8 implementation")
- Push: pushed to `origin/main` as commit `f60de36` on 2026-04-22.
