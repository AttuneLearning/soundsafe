# FS-ISS-006: sfx-roadmap-engine Timer-advance roadmap

**Priority:** High
**Status:** ACTIVE
**QA:** PENDING
**Created:** 2026-04-20
**Started:** 2026-04-21
**Requested By:** Fullstack-Dev (per m1-phases.md M1.5)
**Assigned To:** Fullstack-Dev

## Description

Pure-Rust state machine for a one-step roadmap advancing on a `Timer` condition. Per ADR-022, the engine lives in Rust (not TS) so step advance is sample-accurate and the panic-reachability invariant is proptestable.

The engine takes a `Clock` trait so tests can advance time deterministically without real audio. M1 ships only `Timer` advance; M2 adds `UserTap` and `SudsBelow`.

## Acceptance Criteria

- [x] `Clock` trait in `sfx_roadmap_engine::clock` with `fn processed_samples(&self) -> u64`. Implementors: `SampleCounterClock` (production; `advance(frames)` from the audio graph) and `FakeClock` (test-only, mutable `advance_samples` / `set_samples`).
- [x] `Roadmap`, `Step`, `TransformSpec`, and `AdvanceCondition::Timer { ms: u32 }`. `TransformSpec` keeps the minimal `{ kind: String, params: Vec<(u16, f32)> }` shape until pack-manifest's roadmap type lands.
- [x] `RoadmapRunner<C: Clock>` with `new(roadmap, clock, sample_rate)`, `tick(&mut self)`, `input(RunnerInput)`, and `poll_events(&mut self) -> Vec<RoadmapEvent>`.
- [x] `RoadmapEvent` enum: `StepStarted(u16)`, `StepCompleted(u16)`, `RoadmapCompleted`, `PanicStopRequested`, `PanicFadeComplete`, `SafetyBlocked(SafetyBlock)`.
- [x] `RunnerInput`: `PanicStop`, `Tap` (M2 reserved), `Suds(u8)` (M2 reserved), `Safety(SafetyBlock)`.
- [x] `tick()` consults the clock, computes `elapsed` since `StepStarted`, emits `StepCompleted` and the next `StepStarted` (or `RoadmapCompleted`) when `elapsed >= duration_ms → samples`.
- [x] Snapshot test: `canonical_60s_timer_snapshot` asserts the exact event trace for a 60-second timer at 48 kHz: `StepStarted(0) @ 0 → StepCompleted(0) @ 2_880_000 → RoadmapCompleted @ 2_880_000`. Inlined as an `assert_eq!` rather than an `insta` snapshot file so the first-time dev gate doesn't require snapshot review tooling.
- [x] Proptest `well_formed_event_log_under_arbitrary_interleaving`: random step-duration sequences + random tick advances + optional panic-stop; asserts ordering (StepCompleted(i) only after StepStarted(i); StepStarted(i+1) only after StepCompleted(i); first StepStarted is index 0) and termination (runner always reaches `Done`).
- [x] `RoadmapRunner` is `no_std` friendly (`#![cfg_attr(not(test), no_std)] + extern crate alloc`). No `std::thread`, no `tokio`, no I/O.

## Notes

- The engine does not touch audio samples. It emits events; the audio graph (M1.4) and the rust-core WASM surface (M1.6) decide what to do with them.
- For M1, the Clock is driven by the audio graph's sample counter. In tests, `FakeClock` lets us advance time deterministically — e.g., `clock.advance_samples(2_880_000)` then `runner.tick()`.
- `TransformSpec` is declared here as a placeholder — its concrete shape is owned by `sfx-pack-manifest` (or a new shared type module). For M1, keep it simple: `{ kind: String, params: Vec<(u16, f32)> }`. Align with pack-manifest's roadmap shape if/when that lands.
- `SudsBelow` and `UserTap` advance conditions are **out of scope for M1.5** — M2 adds them alongside the SUDS UI.

## Dependencies

- **`sfx-safety`** (M0, present) for `SafetyBlock` re-export.
- Independent of M1.3/M1.4 at the code level, but the engine's events are consumed by M1.6's wasm-bindgen surface.

## Dev Handoff to QA

- [x] Development Complete
- [x] Awaiting QA
- [x] Typecheck passed (`cargo check --workspace`)
- [x] Unit tests passed (`cargo nextest run -p sfx-roadmap-engine` — 9/9)
- [x] Integration tests passed (snapshot + proptest)
- [x] UAT tests passed (n/a)

## Dev Response (2026-04-21T08:05:30Z)

**Status:** Dev-complete; awaiting QA verification.

Pure-Rust state machine landed. `RoadmapRunner<C: Clock>` drives a
`Roadmap` against a monotonically increasing sample count, emits
ordered events (`StepStarted` / `StepCompleted` / `RoadmapCompleted` /
`PanicStopRequested` / `PanicFadeComplete` / `SafetyBlocked`), and
terminates in a `Done` state either by completing all steps or by
fading out after a `PanicStop` input.

The spec listed `insta` as the snapshot tool. I kept the expected event
trace inlined as a direct `assert_eq!` in `canonical_60s_timer_snapshot`
to avoid adding snapshot-review tooling to the first-time dev gate —
the assertion pins the same structural expectation and fails the test
identically on a drift. Happy to convert to an `insta` snapshot if QA
prefers; the crate already has `insta.workspace = true` under
dev-dependencies.

Local verification:
- `cargo nextest run -p sfx-roadmap-engine` → 9/9 pass (incl. proptest)
- `cargo nextest run --workspace` → 62/62 pass (53 prior + 9 new)
- `cargo check --workspace` → 0 errors
- `pnpm -r typecheck` / `pnpm test` / schema check → all green

- Files: `crates/sfx-roadmap-engine/src/lib.rs` (full state machine + tests), `crates/sfx-roadmap-engine/src/clock.rs` (new — Clock trait + SampleCounterClock + FakeClock).
- Commit: pending

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
