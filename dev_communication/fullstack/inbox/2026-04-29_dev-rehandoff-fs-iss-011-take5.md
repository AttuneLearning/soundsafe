# Re-handoff: FS-ISS-011 take 5

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-29
**In-Response-To:** FS-ISS-011

## Findings addressed

QA's three blockers from 2026-04-29T21:14:19Z, addressed:

1. **`m1-engine-state` stuck at `uninitialized` + `m1-play` never
   enabled.** Root-caused to a missing `engine.init(...)` call in
   the consumer-app shipped path. Fixed via FS-ISS-010 take-5's
   `useEffect` in `App.tsx`. The state machine now transitions
   `uninitialized → initializing → idle` on mount; `unlock(...)
   + loadRoadmap(...)` flips `loadState` to `loaded` and Play
   enables.

2. **Playwright shim was incompatible with the consumer-app's host
   selection.** Reworked `e2e/fixtures/shim.ts`:
   - Removed all TS syntax inside the shim's template-literal body
     (the prior `as any` casts caused Chromium to reject the init
     script before it ran — the actual root cause of the local
     repro's 4/4 boot failures).
   - Force `globalThis.AudioContext` / `AudioWorkletNode` to
     `undefined` so `isWebAudioAvailable()` returns false and the
     consumer's `AutoAckHost` + fake-rustcore branch runs
     deterministically. Consistent with the M1.10 spec's
     "Web Audio is shimmed" approach.
   - Stub `globalThis.fetch` for `/packs/<id>/latest.zip`,
     `/entitlement`, and `/latest.json` so `packClient.unlock(...)`
     resolves end-to-end against canned hello-pack-shaped bytes.
   - Keep the `SharedArrayBuffer = ArrayBuffer` fallback so
     `InMemoryHost`'s `createFastRingSab()` works in non-COI
     contexts.

3. **Ramp / fade behavior assertions now pass.** The Playwright
   spec asserts the full `idle → ramping → playing → fading →
   panicked` sequence and the playhead-monotonic-increase ramp
   probe — both green locally. The `AutoAckHost`'s 500 ms delayed
   `PanicFadeComplete` ack matches ADR-015's fade window so
   Playwright observes `fading` before `panicked` (microtask-level
   acks would be too fast for Playwright's 100 ms poll cadence).

Spec narrowing (formal, accepted at M1.10): the `levelDb` ramp
assertion stays at `/dBFS/` substring rather than a strict numeric
monotonic rise. Without a real audio source flowing into the
worklet (which is **FS-ISS-013**'s scope), the level meter sits at
silence (`−∞ dBFS`) the whole time. The spec's own "do not assert
on audio output via a mock audio sink" note is consistent with this.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass
- `wasm-pack build packages/rust-core --target web --out-dir pkg` → ok
- `wasm-pack test --node packages/rust-core` → **13/13 pass** (was 11)
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 45 vitest tests pass
- `pnpm schema:check` → up to date
- `PLAYWRIGHT_NO_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5180
  pnpm --filter @soundsafe/consumer-app exec playwright test
  --reporter=line` → **4/4 passed (11.9 s)**

```
[1/4] disclaimer → load → ramp → play → fade → panicked  ✅
[2/4] disclaimer acknowledgement persists across reload   ✅
[3/4] pause during ramp returns to idle; play re-enters   ✅
[4/4] a11y: no critical/serious axe violations            ✅
```

## Outstanding gate

- **First-green CI `e2e` run.** This dev session can't trigger CI;
  the run will fire on push of `0efb04d`. CI's webServer config is
  the same as local (Vite dev server on the configured port), and
  the local pass under identical Playwright options gives high
  confidence the CI run will be green. The CI run hash + run URL
  will be attached in QA's verification once the push lands.

- Files: `packages/consumer-app/src/App.tsx`, `packages/consumer-app/e2e/fixtures/shim.ts`.
- Commit: `0efb04d` ("Take-5 unblock: FS-ISS-007 wasm-bindgen tests + FS-ISS-010/011 engine boot")
- Push: pushed to `origin/main` as commit `0efb04d` on 2026-04-29.
