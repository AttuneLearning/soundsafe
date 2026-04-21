# FS-ISS-006: sfx-roadmap-engine Timer-advance roadmap

**Priority:** High
**Status:** QUEUE
**QA:** PENDING
**Created:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.5)
**Assigned To:** Fullstack-Dev

## Description

Pure-Rust state machine for a one-step roadmap advancing on a `Timer` condition. Per ADR-022, the engine lives in Rust (not TS) so step advance is sample-accurate and the panic-reachability invariant is proptestable.

The engine takes a `Clock` trait so tests can advance time deterministically without real audio. M1 ships only `Timer` advance; M2 adds `UserTap` and `SudsBelow`.

## Acceptance Criteria

- [ ] `Clock` trait in `sfx_roadmap_engine::clock` with a minimal surface: `fn processed_samples(&self) -> u64` (monotonically increasing sample count). Implementors: `SampleCounterClock` (production) and `FakeClock` (test-only, mutable).
- [ ] `Roadmap` and `Step` types. `Step { source_id: String, transforms: Vec<TransformSpec>, duration_ms: u32, advance: AdvanceCondition }`. `AdvanceCondition::Timer { ms: u32 }` is the only variant for M1.
- [ ] `RoadmapRunner<C: Clock>` struct with `new(roadmap: Roadmap, clock: C) -> Self`, `tick(&mut self)` (called once per audio block), and `poll_events(&mut self) -> Vec<RoadmapEvent>` (drains pending events).
- [ ] `RoadmapEvent` enum with at least: `StepStarted(u16)`, `StepCompleted(u16)`, `PanicStopRequested`, `PanicFadeComplete`, `SafetyBlocked(SafetyBlock)` (re-exported from `sfx-safety`).
- [ ] User inputs enqueued via `input(RunnerInput)`: `RunnerInput::PanicStop`, `RunnerInput::Tap`, `RunnerInput::Suds(u8)`. (The last two are defined for future phases but unused in M1; keep the enum open.)
- [ ] `tick()` consults the clock, computes elapsed samples since `StepStarted`, and emits `StepCompleted` when `elapsed_ms >= step.duration_ms`. Advances to the next step or emits a final "roadmap complete" event if none remain.
- [ ] `insta` snapshot test for a canonical 1-step roadmap (60-second timer at 48 kHz). Expected event trace:
  ```
  StepStarted(0) at sample=0
  StepCompleted(0) at sample=2_880_000
  RoadmapCompleted at sample=2_880_000
  ```
- [ ] Proptest: for any sequence of `input()` calls interleaved with `tick()` calls with arbitrary (but positive) clock advances, the event log is well-formed:
  - No `StepCompleted(i)` without a prior `StepStarted(i)`.
  - No `StepStarted(i+1)` without a prior `StepCompleted(i)`.
  - A `PanicStop` input always reaches a `PanicStopRequested` event within one `tick()`.
  - A roadmap always reaches completion or a panic-stop terminal state; it never loops forever.
- [ ] `RoadmapRunner` is `no_std` friendly (the crate is pure logic). No `std::thread`, no `tokio`, no I/O.

## Notes

- The engine does not touch audio samples. It emits events; the audio graph (M1.4) and the rust-core WASM surface (M1.6) decide what to do with them.
- For M1, the Clock is driven by the audio graph's sample counter. In tests, `FakeClock` lets us advance time deterministically — e.g., `clock.advance_samples(2_880_000)` then `runner.tick()`.
- `TransformSpec` is declared here as a placeholder — its concrete shape is owned by `sfx-pack-manifest` (or a new shared type module). For M1, keep it simple: `{ kind: String, params: Vec<(u16, f32)> }`. Align with pack-manifest's roadmap shape if/when that lands.
- `SudsBelow` and `UserTap` advance conditions are **out of scope for M1.5** — M2 adds them alongside the SUDS UI.

## Dependencies

- **`sfx-safety`** (M0, present) for `SafetyBlock` re-export.
- Independent of M1.3/M1.4 at the code level, but the engine's events are consumed by M1.6's wasm-bindgen surface.

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`cargo check --workspace`)
- [ ] Unit tests passed (`cargo nextest run -p sfx-roadmap-engine`)
- [ ] Integration tests passed (insta snapshot + proptest)
- [ ] UAT tests passed (n/a)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
