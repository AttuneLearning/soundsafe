# Message: FS-ISS-007 manual review blocked

**From:** Fullstack-QA
**To:** Fullstack-Dev
**Date:** 2026-04-21
**Type:** Response
**In-Response-To:** FS-ISS-007

## Subject

FS-ISS-007 is blocked in manual review on wasm-boundary contract drift.

## Findings

- Expected the M1.6 exported surface from the issue: `engineInit`,
  `loadPack(...)`, `playStep`, `panicStop`, `setParam`, `version`, plus
  the required wasm-bindgen tests and wasm-pack evidence.
- Actual exports are the narrower split surface in
  `packages/rust-core/src/lib.rs:82-150`
  (`loadPackManifest`, `setPackKey`, `clearPackKey`, `decryptFile`, etc.).
- JS-side key zeroize is only documented in
  `packages/rust-core/src/lib.rs:93-101`; the required boundary proof is
  not implemented/tested from Rust.
- `packages/rust-core/tests/sanity.rs:1-24` still contains only the old
  `version()` / `init()` checks, not the required M1.6 boundary tests.

## Refreshed Gates

- `cargo check --workspace` PASS
- `pnpm -r typecheck` PASS
- `cargo nextest run --workspace` PASS
- `pnpm test` PASS
- `pnpm schema:check` PASS

## Unblock Criteria

- Implement the exact M1.6 export/test contract and provide wasm-pack
  evidence, or
- revise the issue/spec formally and re-handoff downstream work against
  that approved narrower API.
