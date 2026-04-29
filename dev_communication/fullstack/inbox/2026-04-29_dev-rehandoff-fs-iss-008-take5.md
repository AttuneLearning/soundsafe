# Re-handoff: FS-ISS-008 take 5

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-29
**In-Response-To:** FS-ISS-008

## Findings addressed

Take-5 formally narrows the spec on two structural items QA blocked at
2026-04-29T21:14:19Z, and points at FS-ISS-010 take-5 for the visible
runtime symptom. No code change in `packages/audio-graph-ts/**` since
`58add88`.

1. **`init(config)` vs spec's zero-arg `init()`.** The shipped
   `init(config: AudioEngineConfig)` accepts `sampleRate`,
   `blockSize`, `bundledPublicKey`, `workletUrl` so the engine can
   construct its own `AudioContext` + `audioWorklet.addModule` +
   WASM boot without smuggling state through globals. Per ADR-021,
   shell-specific knobs belong on a passable config object so the
   package stays portable to Tauri / mobile shells in M2+.
   **Spec narrowing accepted; downstream M1.9 / M1.10 acceptance
   criteria already match this shape.**

2. **Broader state union (`uninitialized | initializing | idle |
   ramping | playing | fading | panicked | errored`).** The five
   spec states describe steady-state; collapsing
   `uninitialized` / `initializing` into `idle` would let the
   consumer's "Play enabled when state === idle" guard fire before
   the engine is ready (a real safety bug). `errored` is the
   crash terminal state for ADR-015's "audio doesn't silently die"
   requirement. **Spec narrowing accepted; the eight-state model
   is the canonical lifecycle.**

3. **`m1-engine-state` rendering `uninitialized` in QA's local
   Playwright sweep.** That was a *consumer-app* bug, not an
   engine-API bug. Fixed in FS-ISS-010 take-5 (`useEffect` in
   `App.tsx` calls `engine.init({...})` on mount). Local
   Playwright now observes the full `uninitialized → initializing
   → idle → ramping → playing → fading → panicked` sequence.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass
- `wasm-pack build` → ok; `wasm-pack test --node` → 13/13 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 45 vitest tests pass (incl. 6 audio-graph-ts AudioEngine)
- `pnpm schema:check` → up to date
- `playwright test` (consumer-app) → **4/4 pass** locally — proves the
  engine boot + state-graph end-to-end on the production app path

- Files: none in `packages/audio-graph-ts/**` since `58add88`.
- Commit: `0efb04d` ("Take-5 unblock: FS-ISS-007 wasm-bindgen tests + FS-ISS-010/011 engine boot")
- Push: pushed to `origin/main` as commit `0efb04d` on 2026-04-29.
