# ADR-022: Roadmap engine lives in Rust, not TS

**Status:** Accepted
**Date:** 2026-04-20
**Domain:** Audio

## Context

The roadmap is an ordered sequence of steps, each with a source sound + transforms + duration + an advance condition (Timer, UserTap, or SudsBelow). A "roadmap runner" state machine drives playback: it starts steps, listens for advance signals, records SUDS, emits step-complete events, and blocks when safety layers fire.

The state machine can live in TypeScript (alongside React state) or in Rust (alongside the audio graph). Both are viable on the surface.

A Timer advance condition that says "advance after 90 seconds of audio" must fire at a specific sample count, not a wall-clock `setTimeout`. A SUDS-below advance condition that says "advance when the user rates SUDS ≤ 4" must fire within one audio block of the rating, not after a main-thread render tick.

A TS engine would need to observe `PROGRESS_TICK` events from the audio thread, decide to advance, and send `playStep(next)` back down — adding 16 ms of frame jitter plus the cost of a React render, during which the audio would drift past the threshold.

## Decision

**The roadmap engine lives in Rust** (`sfx-roadmap-engine`), instantiated inside the audio-worklet WASM instance (per ADR-020) alongside the audio graph and safety rails.

- Engine takes a `Clock` trait (processed-samples counter) so tests can advance time deterministically without audio.
- Engine consumes inputs via the same lock-free SPSC ring used for parameter changes: `Tap`, `Suds(u8)`, `PanicStop`, `ClockTick(n_samples)`.
- Engine emits events onto the fast ring (`STEP_ADVANCED`, `PANIC_FADE_COMPLETE`, `SAFETY_BLOCKED`) and the slow channel (`STEP_COMPLETED` with SUDS history).
- TypeScript holds an **advisory mirror** via `useSyncExternalStore` on the fast ring. The mirror renders the current step in React. If main and worklet disagree about `currentStep`, the worklet wins.

## Consequences

### Positive
- Timer advance is sample-accurate. No drift.
- SUDS-below advance fires within one block (<3 ms at 48 kHz/128 frames) of the rating.
- Engine is proptest-covered: any sequence of inputs produces a well-formed event trace; panic reachable from any state; `STEP_ADVANCED` never regresses.
- The engine is testable in pure Rust without a browser — faster CI, deeper property coverage.
- Roadmap authored in v1 plays identically in v2: the stable API rule (ADR-016) applies to engine transitions, not just DSP.

### Negative / trade-offs
- React state hooks can't "own" the current step — the hook is a subscription to the worklet, not a mutable store. Some React patterns don't apply.
- Debugging an engine state transition means reading fast-ring events, not React DevTools.
- If the engine needs to grow to consult plugin logic (e.g. therapist-assigned advance policies in v2), crossing the WASM boundary for each decision is less ergonomic than keeping the engine in TS would be.

### Neutral / to watch
- When TS and worklet disagree about `currentStep` (e.g., worklet auto-advanced on SUDS while main was mid-render), the reconciliation rule is "worklet wins on next tick." Document this invariant in the `useSyncExternalStore` hook so future contributors don't invert it.
- The `Clock` trait in `sfx-roadmap-engine` is what makes proptest work. If we're tempted to inline a real `Instant` for convenience in `process()`, don't — the trait is load-bearing for testability.

## Alternatives considered

- **Engine in TypeScript.** Rejected: Timer drift (wall-clock vs. samples), SUDS advance latency (~16 ms React frame + render cost), and loss of proptest coverage.
- **Split engine: transitions in TS, timing in Rust.** Rejected: the transitions *are* the timing. The split is artificial and the coordination overhead kills the correctness argument.
- **Engine in Rust but TS-accessible via direct method calls.** Rejected: breaks the thread topology (ADR-020) — main thread would need to call into the worklet WASM synchronously, which we don't allow.

## References

- ADR-002 (React + TS + wasm-bindgen)
- ADR-016 (stable transform + roadmap API)
- ADR-018 (proptest for DSP and engine invariants)
- ADR-020 (thread topology)
- Plan: `/home/adam/.claude/plans/distributed-napping-lemon.md` §Roadmap engine ownership
