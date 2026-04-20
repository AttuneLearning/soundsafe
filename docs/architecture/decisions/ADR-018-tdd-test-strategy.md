# ADR-018: TDD as default workflow; Rust + TS test stack

**Status:** Accepted
**Date:** 2026-04-20
**Domain:** Tooling

## Context

The team works test-first (TDD) by default. The repo spans a Rust/WASM audio core (ADR-002, ADR-005) and a TypeScript consumer app plus serverless workers. Audio DSP transforms (ADR-016) have invariants that are poorly covered by example-based tests and well-suited to property-based testing. Safety rails (ADR-015) — panic-stop, volume ceiling, ramp-up — must be covered by tests that would fail loudly if someone breaks them.

The test strategy needs to give a fast inner loop on the native Rust side (not through the browser), defer the slow WASM-in-browser path to a small boundary suite, and pick TS-side runners that match the stack already chosen in ADR-002.

## Decision

We practice **TDD by default**: write the failing test first, make it pass, refactor. Applies to both Rust and TypeScript code.

**Rust test stack (in `packages/rust-core` and any other Rust crate):**

- Unit tests live inline in `#[cfg(test)] mod tests { ... }` blocks alongside the code under test (access to private items).
- Integration tests live in `tests/` at the crate root and exercise only the public API.
- Doc tests (`///` examples) are compiled and run as part of `cargo test`.
- **`cargo nextest`** is the canonical runner — faster, better output, proper per-test process isolation.
- **`bacon`** provides the watch loop for the TDD inner cycle.
- **`rstest`** for parameterized tests and fixtures.
- **`proptest`** for property-based testing; **mandatory for audio DSP transforms**. Required invariants include: bypass transform == identity, output ceiling never exceeded, no NaN/Inf in output buffers, output length == input length (for non-resampling transforms), determinism given fixed seed.
- **`insta`** for snapshot tests (pack manifests, transform chain serialization, error messages).
- **`pretty_assertions`** + **`assert_matches`** for readable failures.
- **`criterion`** for benchmarks (separate `benches/` target, not run in the TDD loop).

**WASM boundary tests (Rust → browser):**

- `wasm-bindgen-test` is reserved for a **small, targeted suite** that exercises the JS↔WASM boundary (memory passing, audio buffer handoff, panic propagation). It does **not** participate in the TDD inner loop.
- All DSP logic is tested natively via `cargo test` / `cargo nextest`. We do not TDD through the browser.

**TypeScript test stack (consumer-app, ui-kit, pack-tooling, workers):**

- **Vitest** in watch mode is the TDD inner loop (already established in ADR-002).
- **@testing-library/react** for component tests.
- **Playwright** for end-to-end flows (disclaimer, panic-stop, roadmap progression, entitlement gating). E2E is not part of the TDD inner loop.
- **MSW** (Mock Service Worker) for HTTP mocking in worker and app tests.

**Test placement conventions:**

- Rust: inline `mod tests` for unit, `tests/*.rs` for integration, `benches/*.rs` for criterion.
- TS: co-located `*.test.ts[x]` next to source files for unit; `e2e/` at app root for Playwright.
- Fixture audio for DSP tests lives in `packages/rust-core/tests/fixtures/` and is kept small (sub-second clips).

## Consequences

### Positive

- Native Rust TDD loop stays sub-second even as the core grows — no browser round-trip.
- Property tests catch whole classes of DSP bugs (clipping, NaN propagation, off-by-one buffer sizing) that example tests miss, and directly encode the safety invariants from ADR-015.
- `cargo nextest`'s per-test isolation prevents state leaks from one DSP test into another (important once we add global audio-context-like state).
- Vitest + Playwright is the same split the React ecosystem has converged on; low onboarding cost.
- Doc tests double as usage examples that cannot silently rot.

### Negative / trade-offs

- Three test surfaces to learn (native Rust, wasm-bindgen-test, TS). Mitigated by the rule that only the JS↔WASM boundary runs in-browser.
- Proptest failures can be noisy; requires discipline in writing shrinkers and bounding input ranges.
- `insta` snapshot files need review discipline to avoid rubber-stamping.

### Neutral / to watch

- CI wiring is deferred (see gaps). When CI lands, nextest + vitest + playwright are the jobs to parallelize; wasm-bindgen-test will be a separate, slower job.
- If the WASM boundary surface grows, we may need to invest more in `wasm-bindgen-test` harness ergonomics. Revisit after the rust-core prototype (relates to GAP-001).
- Mutation testing (`cargo-mutants`) is deliberately out of scope for v1 but worth revisiting once the core stabilizes.

## Alternatives considered

- **`cargo test` only, skip nextest.** Works, but loses per-test process isolation and better output. Nextest is a near-zero-cost upgrade.
- **TDD through `wasm-bindgen-test` for DSP code.** Rejected — browser round-trip kills the inner loop; DSP logic is pure Rust and has no reason to depend on the browser.
- **Jest on the TS side.** Rejected — Vitest is faster, matches the Vite build already chosen in ADR-002, and has better ESM/TS handling out of the box.
- **Cypress for E2E.** Rejected in favor of Playwright: better cross-browser support, parallel execution, and trace-viewer debugging.
- **Skip property testing.** Rejected — audio DSP invariants are exactly the shape proptest handles best, and safety-critical rails (ADR-015) deserve stronger coverage than example tests give.

## References

- Related ADRs: ADR-002 (React + TS + wasm-bindgen, names Vitest/Playwright), ADR-005 (monorepo layout), ADR-015 (safety posture — invariants to test), ADR-016 (transform library — proptest targets).
- Related gaps: GAP-001 (WASM/Web Audio boundary — affects what wasm-bindgen-test must cover).
- External: `cargo-nextest`, `bacon`, `proptest`, `rstest`, `insta`, Vitest, Playwright.
