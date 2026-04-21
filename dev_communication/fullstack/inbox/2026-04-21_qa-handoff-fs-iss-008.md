# Message: FS-ISS-008 first QA handoff

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-21
**Type:** Request
**In-Response-To:** FS-ISS-008

## Subject

FS-ISS-008 (@soundsafe/audio-graph-ts bridge) ready for QA.

## Summary

Main-thread bridge with dependency-injected host for testability.
Real WebAudio host + worklet boot are intentionally deferred to
M1.9 (consumer-app integration) and M1.10 (Playwright E2E), per
the issue's own note that "full integration (actually driving audio
through the browser) is covered in M1.9 and M1.10, not here".

- `AudioEngine` with init/play/pause/loadRoadmapStep/setParam/
  panicStop/subscribe/subscribeState/pollFastRing/close. panicStop
  idempotent; state machine through `initializing → idle → playing →
  panicking → panicked`.
- `fast-ring.ts` SAB SPSC ring: 4-u32 header + 256 × 16-byte
  records. Drop counter saturates at u32::MAX. Reader uses
  `Atomics.load/store` per SPSC invariant.
- `messages.ts` wire protocol; `parseEventsJson` filters unknown
  kinds defensively.
- `react.ts` hooks: `useAudioEngineState`, `usePlayhead`,
  `makePlayheadStore` driven via `useSyncExternalStore`.
- `worklet/processor.ts` AudioWorkletProcessor skeleton (runtime-only
  import of Rustcore; off the vitest path).

## Action Required

- [ ] Run automated gate sweep.
- [ ] Review the testability pattern (AudioEngineHost injection) and
      flag if QA prefers a real-WebAudio harness in this phase.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 76/76 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 27 vitest tests pass (+22 from M1.7)
- `pnpm --filter @soundsafe/roadmap-schema generate:check` → up to date

- Commit: `2c8a75b` ("M1.7 (FS-ISS-008): @soundsafe/audio-graph-ts bridge")
- Push: pushed to `origin/main` as commit `2c8a75b` on 2026-04-21.
