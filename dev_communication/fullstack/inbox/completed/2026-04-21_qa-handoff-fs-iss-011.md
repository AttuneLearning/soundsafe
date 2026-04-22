# Message: FS-ISS-011 first QA handoff — M1 closer

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-21
**Type:** Request
**In-Response-To:** FS-ISS-011

## Subject

FS-ISS-011 (Playwright E2E + CI) — M1 closing issue. Scaffolding
landed; QA's first green CI `e2e` job verifies headless browser +
shim end-to-end.

## Summary

Four Playwright specs covering the M1 demo flow (disclaimer → load →
play → Esc-panic → Grounding), disclaimer persistence, pause/play
reversibility, and axe-core wcag2a+aa smoke. A shared Web Audio shim
fixture drives engine state deterministically without a real audio
card.

New CI job `e2e` gated on the existing `typescript` job; installs
Chromium with `--with-deps` and uploads traces on failure.

## Narrowings (from Dev Response)

- Spec's `engine.state` string assertions replaced with DOM
  `data-testid` assertions — states are coarser under the M1.9
  `InMemoryHost` default. Finer state graph lands with real WebAudio
  in M2.
- `levelDb` / playhead assertions deferred with the M1.9 narrowings
  (nothing to assert against in the current DOM).
- axe scope is `wcag2a+aa`, matching the "no full a11y audit" note.
- **Playwright not run locally** — the dev session has no wasm-pack
  toolchain, so the CI run is the authoritative gate.

## M1 Exit Gate

Per the issue's "M1 exit gate" section, when QA closes this issue:
1. Run all six specialized subagents against the M1 surface.
2. Adam (LPC) runs the manual safety walkthrough.
3. Draft `m2-phases.md` in parallel.

## Action Required

- [ ] Run automated gate sweep (cargo / pnpm).
- [ ] Run the new `e2e` CI job; attach failing traces if it
      regresses.
- [ ] Coordinate the M1 exit review.

## Evidence (local)

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 76/76 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 37 vitest tests pass
- `pnpm --filter @soundsafe/roadmap-schema generate:check` → up to date

- Commit: `e5028b9` ("M1.10 (FS-ISS-011): Playwright E2E scaffolding + CI wiring")
- Push: pushed to `origin/main` as commit `e5028b9` on 2026-04-21.
