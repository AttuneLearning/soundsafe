# Message: FS-ISS-011 re-handoff — state/level DOM + retries=0

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-22
**Type:** Request
**In-Response-To:** FS-ISS-011

## Subject

FS-ISS-011 re-handoff. Engine state and level-dBFS are now
assertable from Playwright; Playwright retries set to 0; M1.9's
indicator gaps closed upstream so this issue's assertions have
something to hit.

## Summary

- **`retries: 0`** unconditionally in `playwright.config.ts` (was
  `process.env.CI ? 1 : 0`). Flaky e2e surfaces red, doesn't paper
  itself over.
- **`engine.state` in the DOM.** FS-ISS-010 added
  `data-testid="m1-engine-state"`. The e2e spec now asserts the full
  transition graph across Load + Play + Panic:
  - `idle` (or `initializing` briefly) after the disclaimer
  - `playing` after Play
  - `panicking` then `panicked` after Escape
- **`levelDb` in the DOM.** `data-testid="m1-level-db"` renders the
  current post-limiter peak. The e2e asserts the indicator value
  matches `/dBFS/` — a strict numeric ramp assertion is M2 scope
  once a real signal flows through the shim.
- **Pause test upgraded.** Now asserts the full round-trip:
  `idle → playing → idle → playing`. The issue's "no stuck states"
  requirement is satisfied.
- **axe-core smoke** continues to pass on the post-disclaimer M1
  demo (scope `wcag2a+aa`).

The **first CI run** is still the authoritative verification — the
wasm-pack `pkg/` now builds clean in this dev session, so the CI
pipeline has a buildable WASM artifact to feed the browser. I can't
run headless Chromium locally; that happens when the CI job fires.

## Remaining narrowing

- `levelDb` is asserted only for the "has-`dBFS`-suffix" shape, not
  for a monotonic ramp. Adding a numeric ramp assertion requires a
  shim that emits a synthetic level signal, which is M2 scope per
  the issue's own "do not assert on audio output via a mock audio
  sink that records samples" note.

## Evidence (local, what this session could run)

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 42 vitest tests pass
- `pnpm schema:check` → up to date
- `wasm-pack build packages/rust-core --target web --out-dir pkg` → ok
- `wasm-pack test --node packages/rust-core` → 10/10 pass

## Action Required

- [ ] Re-run the automated gate sweep.
- [ ] Fire the CI `e2e` job. If green, this unblocks the M1 exit
      review (six specialized subagents + Adam's LPC walkthrough +
      `m2-phases.md` drafting, per the issue's M1 exit gate block).

- Commit: `c44ac0b` ("FS-ISS-010/011 unblock: unlock integration + DOM telemetry + retries=0")
- Push: pushed to `origin/main` as commit `c44ac0b` on 2026-04-22.
