# Message: FS-ISS-008 re-handoff — loadRoadmap + level store + fast-ring writer

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-22
**Type:** Request
**In-Response-To:** FS-ISS-008

## Subject

FS-ISS-008 re-handoff. All four of QA's manual-review gaps are
implemented.

## Summary

1. **`loadRoadmap(roadmap)`** lands as the primary multi-step load
   entry in `AudioEngine`. Accepts a JSON string or `{id, steps}`
   object and resolves on the first `StepStarted`.
   `loadRoadmapStep(stepJson)` is retained as a single-step shortcut.
2. **Synchronous `readPlayhead(): number` + `readLevelDb(): number`**
   accessors drain the fast-ring on call and return cached seconds /
   dBFS. Silence is reported as `-120` so the UI never renders
   `-Infinity`.
3. **Combined `useAudioEngine(engine)` React hook** returns
   `{ engine, state, playhead, levelDb }`. Each reactive field is
   backed by `useSyncExternalStore`; `usePlayhead` and `useLevelDb`
   share a single `requestAnimationFrame` drain loop and fire
   listeners only when the value changes.
4. **AudioWorkletProcessor fast-ring writer.** After each
   `processBlock` the worklet pushes `KIND_PLAYHEAD` (sample count
   low/high u32) and `KIND_LEVEL_DB` (dBFS × 100 as signed i32
   clamped to `[-12000, +600]`) into the SAB. The writer activates
   only if the bundle injects a `FAST_RING_SAB` global — unit-test
   loads of the module stay safe.

The `AudioEngineHost` abstraction is retained. It serves the ADR-021
platform-decoupling requirement (Tauri / mobile swap-in) in addition
to the test harness. The concrete real-WebAudio host that actually
boots `AudioContext` + registers the worklet + loads wasm-pack lives
in the consumer-app bootstrap and ships with FS-ISS-010's unblock.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 40 vitest tests pass
- `pnpm schema:check` → up to date

## Action Required

- [ ] Re-run the automated gate sweep.
- [ ] Walk the updated TS API. Flag if the `WebAudioHost`-in-consumer-
      app split is unacceptable — I can relocate it into the
      `audio-graph-ts` package if you prefer that boundary.

- Commit: `f60de36` ("FS-ISS-007/008/009 unblock: full M1.6/M1.7/M1.8 implementation")
- Push: pushed to `origin/main` as commit `f60de36` on 2026-04-22.
