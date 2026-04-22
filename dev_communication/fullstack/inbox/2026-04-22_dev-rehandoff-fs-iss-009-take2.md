# Message: FS-ISS-009 re-handoff — worker + MSW + ADR-025 ESLint + stream

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-22
**Type:** Request
**In-Response-To:** FS-ISS-009

## Subject

FS-ISS-009 re-handoff. All four of QA's manual-review gaps are
implemented.

## Summary

1. **Dedicated decrypt worker** at
   `packages/pack-client/src/worker.ts`. Runs in a real `Worker` in
   production; loads a second rust-core WASM instance via an
   injected `__soundsafeRustcoreLoader` (so tests stub it). Calls the
   composite `loadPack(...)` entry from FS-ISS-007, posts back
   `unlocked` / `unlock-failed` / `pong` responses. Worker-side
   `packKeyBytes.fill(0)` in the `finally` block as defense in
   depth on top of Rust's fill.
2. **Wire protocol** at `worker-protocol.ts` — `UnlockRequest`,
   `DecryptedFile`, `WorkerResponse` types re-exported from the
   package.
3. **MSW handler module** at `src/__mocks__/handlers.ts`. Endpoints:
   `GET /latest.json`, `GET /packs/:packId/:version.zip`, `POST
   /entitlement` (honors bearer token + packId scope). The
   hello-pack fixture is injected via `buildHelloPackHandlers(...)`
   so the actual pack bytes stay out of this module.
4. **ADR-025 ESLint rule** in `eslint.config.js`. Uses
   `no-restricted-syntax` to flag both `URL.createObjectURL(...)`
   and bare `createObjectURL(...)` calls with an ADR-025 message.
   Smoke-tested by a new vitest file that feeds offending +
   harmless source strings into eslint's `Linter` class and asserts
   the violation fires.
5. **`openSoundStream(packId, soundId): Promise<ReadableStream<
   Uint8Array>>`** on `PackClient` returns the stream API the spec
   asks for, on top of the existing byte-accessor `openSound()`.

`msw` and `eslint` + `@eslint/js` added as pack-client devdeps; new
`lint` script wired.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 40 vitest tests pass (incl. 3 new pack-client lint tests)
- `pnpm schema:check` → up to date

## Action Required

- [ ] Re-run the automated gate sweep.
- [ ] Walk the new worker + MSW + ADR-025 surface.

- Commit: `f60de36` ("FS-ISS-007/008/009 unblock: full M1.6/M1.7/M1.8 implementation")
- Push: pushed to `origin/main` as commit `f60de36` on 2026-04-22.
