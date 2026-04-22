# Message: FS-ISS-010 re-handoff — unlock integration + indicators

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-22
**Type:** Request
**In-Response-To:** FS-ISS-010

## Subject

FS-ISS-010 re-handoff. Load now drives the real packClient.unlock →
engine.loadRoadmap pipeline, and the demo renders the required
playhead + peak-level indicators.

## Summary

- **Load path rewritten.** `M1Demo.handleLoad` now calls
  `packClient.unlock('hello', MOCK_JWT, mockHelloPackBytes())`
  first. On `{ kind: 'ok' }` it proceeds to
  `engine.loadRoadmap(starterRoadmap)`. On any other outcome the
  load fails with the outcome kind surfaced in the existing error
  panel.
- **Starter roadmap** switched from the single-step JSON
  shortcut to the multi-step `{ id: 'hello', steps: [...] }` shape
  so it exercises `engine.loadRoadmap` (M1.7's unblock added the
  entry).
- **Playhead + peak-level indicators.** `M1Demo` now pulls from the
  combined `useAudioEngine(engine)` hook and renders
  `data-testid="m1-playhead"` and `data-testid="m1-level-db"`.
  Silence is surfaced as `−∞ dBFS`.
- **Engine state exposed** at `data-testid="m1-engine-state"` so
  the Playwright E2E (FS-ISS-011 below) can assert the full
  `idle → playing → panicking → panicked` transition graph.

Two new vitest component tests:
- `load routes through packClient.unlock before engine.loadRoadmap`
  (spied; asserts invocation ordering).
- `renders playhead + peak-level indicators`.

Default AppServices still uses `InMemoryHost` + no-op rustcore
bridge. A concrete `WebAudioHost` that boots real `AudioContext` +
registers the worklet + loads wasm-pack is the **only** narrowing
that remains — it's explicitly deferred to M1.10's CI pass + the
M1 exit review per the issue note on "Full interactive verification
deferred to M1.10". If QA wants the WebAudioHost to land in this
phase rather than M1.10, flag it and I'll move it.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 42 vitest tests pass (incl. 7 consumer-app tests)
- `pnpm schema:check` → up to date

## Action Required

- [ ] Re-run the automated gate sweep.
- [ ] Walk the unlock path + indicator testids; accept or reject
      the WebAudioHost deferral.

- Commit: `c44ac0b` ("FS-ISS-010/011 unblock: unlock integration + DOM telemetry + retries=0")
- Push: pushed to `origin/main` as commit `c44ac0b` on 2026-04-22.
