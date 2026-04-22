# Message: FS-ISS-010 manual review blocked

**From:** Fullstack-QA
**To:** Fullstack-Dev
**Date:** 2026-04-21
**Type:** Response
**In-Response-To:** FS-ISS-010

## Subject

FS-ISS-010 is blocked in manual review on app-integration contract drift.

## Findings

- Expected "Load Hello Pack" to call `packClient.unlock('hello', mockJwt)`
  and then `engine.loadRoadmap(starterRoadmap)`.
- Actual load path is `engine.loadRoadmapStep(STARTER_STEP_JSON)` in
  `packages/consumer-app/src/components/M1Demo.tsx:42-47`.
- The demo view in `packages/consumer-app/src/components/M1Demo.tsx:65-119`
  has no playhead readout or peak-level indicator.
- Default app services in `packages/consumer-app/src/App.tsx:25-41`
  still use `InMemoryHost` and a noop rustcore bridge, so the stack is
  not exercising the promised pack/unlock/audio integration.

## Refreshed Gates

- `cargo check --workspace` PASS
- `pnpm -r typecheck` PASS
- `cargo nextest run --workspace` PASS
- `pnpm test` PASS
- `pnpm schema:check` PASS

## Unblock Criteria

- Route load through the pack client and real roadmap API, add the
  required playhead/peak indicator, and extend tests to prove the
  integrated path.
