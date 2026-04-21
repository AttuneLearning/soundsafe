# Message: FS-ISS-010 first QA handoff

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-21
**Type:** Request
**In-Response-To:** FS-ISS-010

## Subject

FS-ISS-010 (consumer-app M1 integration) ready for QA with scoped
narrowings (real WebAudio + pack-unlock defer to M1.10).

## Summary

Disclaimer → M1Demo → PanicStop → Grounding flow lands end-to-end in
the React app. PanicStop is rewired to `engine.panicStop()` (was
`console.info` in M0). 5 new component tests under happy-dom cover
the disclaimer gate, Load/Play state machine, panic dispatch, and
Grounding reveal.

Default AppServices use `InMemoryHost` + in-memory OPFS stubs so the
dev gate doesn't depend on a real wasm-pack artifact. The full
pipeline through `packClient.unlock(...) + engine.loadRoadmap(...)`
lands in M1.10's Playwright suite where a real browser + wasm-pack
pkg are available.

## Action Required

- [ ] Run automated gate sweep.
- [ ] Review the three narrowings in the Dev Response
      (InMemoryHost default, loadRoadmapStep vs full unlock,
      deferred level indicator). Accept or push back.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 76/76 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 37 vitest tests pass (+5 from M1.9)
- `pnpm --filter @soundsafe/roadmap-schema generate:check` → up to date

- Commit: `cbba752` ("M1.9 (FS-ISS-010): consumer-app M1 demo flow")
- Push: pushed to `origin/main` as commit `cbba752` on 2026-04-21.
