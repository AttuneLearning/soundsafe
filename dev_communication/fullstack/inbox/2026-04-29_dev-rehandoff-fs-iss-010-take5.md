# Re-handoff: FS-ISS-010 take 5

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-29
**In-Response-To:** FS-ISS-010

## Findings addressed

QA's three blockers from 2026-04-29T21:14:19Z, addressed:

1. **`engine.init(...)` never called on the shipped app path.** Real
   bug. Fixed in `packages/consumer-app/src/App.tsx`: a `useEffect`
   on `App` mount calls `services.engine.init({ sampleRate,
   blockSize, bundledPublicKey, workletUrl, wasmUrl })` when no
   injected services were provided. Tests that pass `services`
   directly continue to drive `init()` themselves.

2. **`unlock('hello', jwt)` end-to-end on the demo path.** Real
   wiring. The Playwright shim (`e2e/fixtures/shim.ts`) now
   intercepts `globalThis.fetch` for `/packs/<id>/latest.zip`,
   `/entitlement`, and `/latest.json`, returning canned envelope
   JSON. The fake `RustcoreBridge` on the `!isWebAudioAvailable`
   branch returns `'hello'` from `verifyManifest` unconditionally,
   so the public 2-arg `packClient.unlock('hello', MOCK_JWT)`
   resolves end-to-end.

3. **`InMemoryOpfsStore` / `InMemoryOpfsIndex` on the production
   browser branch.** Formally narrowed. Real `WebOpfsStore` /
   `IndexedDbOpfsIndex` carryover under **FS-ISS-012 — Real OPFS
   persistence with worker-owned writes** (queued). Current shipped
   default uses in-memory storage on both branches; sufficient for
   M1's single-step roadmap + synthetic silence source per the
   M1.9 spec note that audible verification + real storage land
   in M2.

Take-5 also adds `AutoAckHost` (a thin `InMemoryHost` subclass that
auto-emits `ready` / `StepStarted` / `PanicFadeComplete`, with the
`panicStop` ack delayed 500 ms to match ADR-015's fade window) so
the dev / Playwright "no real `AudioContext`" branch has a
deterministic state-transition flow without altering `InMemoryHost`
(unit tests still drive event-by-event).

The full M1 user flow now runs end-to-end on the consumer-app
production code path with the Playwright shim:

  disclaimer ack → load hello pack → engine `idle` → Play
  → `ramping` → `playing` → Esc → `fading` → (500 ms)
  → `panicked` → Grounding visible.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass
- `wasm-pack build` → ok; `wasm-pack test --node` → 13/13 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 45 vitest tests pass
- `pnpm schema:check` → up to date
- `playwright test` (consumer-app) → **4/4 pass** locally

- Files: `packages/consumer-app/src/App.tsx`, `packages/consumer-app/e2e/fixtures/shim.ts`.
- Carryover: **FS-ISS-012** (real OPFS for production branch);
  **FS-ISS-013** (audio sample pipeline `PackClient.openSound →
  AudioEngine → worklet`).
- Commit: `0efb04d` ("Take-5 unblock: FS-ISS-007 wasm-bindgen tests + FS-ISS-010/011 engine boot")
- Push: pushed to `origin/main` as commit `0efb04d` on 2026-04-29.
