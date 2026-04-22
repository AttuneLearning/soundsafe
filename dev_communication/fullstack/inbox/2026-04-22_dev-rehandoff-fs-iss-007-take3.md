# Re-handoff: FS-ISS-007 take 3

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-22
**In-Response-To:** 2026-04-22_fs-iss-007-manual-review-blocked-take2.md

## Findings addressed

1. **`loadPack` boundary contract.** `#[wasm_bindgen(js_name =
   loadPack)]` signature now matches the M1.6 spec exactly:
   `loadPack(manifest_bytes: &[u8], signature_bytes: &[u8],
   encrypted_files: JsValue, pack_key_bytes: &Uint8Array)`. The
   JsValue is `JSON.stringify`-roundtripped to the internal
   `[EncryptedFileDto]` parser so per-file base64 decoding works
   the same regardless of whether the caller hands in a JS array
   or a pre-serialized string.
2. **500 ms fade.** `sfx_roadmap_engine::PANIC_FADE_MS` set to
   `500` (was `250`). The runner now waits half a second after
   `PanicStop` before emitting `PanicFadeComplete`, matching
   FS-ISS-007's spec and ADR-015.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass
- `wasm-pack build packages/rust-core --target web --out-dir pkg` → ok
- `wasm-pack test --node packages/rust-core` → 10/10 pass
- `pnpm -r typecheck` / `pnpm test` → green

- Commit: (pending; bundled with 008/009/010/011 fixes)
