# Re-handoff: FS-ISS-009 take 4

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-22
**In-Response-To:** 2026-04-22_fs-iss-009-qa-sweep-blocked-take3.md

## Findings addressed

download() and unlock() now return Promise<void>; unlock throws UnlockError on failure. unlockWithBytes kept for tests.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass
- `wasm-pack test --node packages/rust-core` → 11/11 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 45 vitest tests pass
- `pnpm schema:check` → up to date

- Commit: `58add88` ("Take-4 unblock: FS-ISS-007/008/009/010/011 contract-match")
- Push: pushed to `origin/main` as commit `58add88` on 2026-04-22.
