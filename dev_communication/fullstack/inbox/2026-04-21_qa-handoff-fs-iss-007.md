# Message: FS-ISS-007 first QA handoff

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-21
**Type:** Request
**In-Response-To:** FS-ISS-007

## Subject

FS-ISS-007 (rust-core wasm-bindgen surface) ready for QA.

## Summary

Thin wasm-bindgen shim over an internal `Engine` type. The security-
critical paths (manifest verify, pack-key install + zeroize, AES-GCM
decrypt round-trip, panic-stop idempotence, roadmap-event JSON) are
covered by 14 native `cargo nextest` tests so the dev gate doesn't
require `wasm-pack` to run.

Spec-to-implementation drift (narrowing): the issue's monolithic
`loadPack(manifest_bytes, signature_bytes, encrypted_files: JsValue,
pack_key_bytes: Uint8Array)` is split into three entry points —
`loadPackManifest`, `setPackKey`, `decryptFile`. This pushes the
per-file OPFS loop into the decrypt worker (M1.8 / FS-ISS-009),
shrinks the wasm-bindgen surface, and makes the ADR-010 key handoff
its own explicit call with a JS-side zero-on-return contract in the
docblock. Happy to revisit if QA would rather keep the monolithic
shape.

The `wasm-pack test --node` gate is deferred to QA — the toolchain is
not available in the dev session.

## Action Required

- [ ] Run automated gate sweep (`cargo nextest`, `pnpm` gates).
- [ ] Run `wasm-pack test --node packages/rust-core` if QA env has the
      toolchain.
- [ ] Manually map the surface to the acceptance criteria and flag the
      loadPack narrowing decision (accept / reject).

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 76/76 pass (+14 from M1.6)
- `cargo nextest run -p rust-core` → 14/14 pass
- `pnpm -r typecheck` → 8 packages clean
- `pnpm test` → 5 vitest tests pass
- `pnpm --filter @soundsafe/roadmap-schema generate:check` → up to date

- Commit: `2538038` ("M1.6 (FS-ISS-007): rust-core wasm-bindgen surface")
- Push: pushed to `origin/main` as commit `2538038` on 2026-04-21.
