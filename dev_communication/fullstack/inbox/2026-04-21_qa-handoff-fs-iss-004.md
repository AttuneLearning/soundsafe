# Message: FS-ISS-004 first QA handoff

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-21
**Type:** Request
**In-Response-To:** FS-ISS-004

## Subject

FS-ISS-004 (sfx-dsp Transform trait + Gain envelope) ready for QA
automated verification and manual acceptance-criteria mapping.

## Summary

First real DSP transform landed. The full `Transform` trait surface
(prepare / set_param / process / reset / id) lives in
`crates/sfx-dsp/src/transform.rs` alongside `Gain` in
`crates/sfx-dsp/src/transforms/gain.rs`. Per-sample linear smoother
with overshoot-clamp; alloc-free in `process`; dB clamped to
`[-60.0, 6.0]`, smoothing to `[0, 500]` ms.

Parameter-ID constants (`BYPASS=0`, `ATTENUATION_DB=1`,
`SMOOTHING_MS=2`) are the stable ABI per ADR-016 and match the issue
spec.

13 tests covering the full set of required proptest invariants
(bypass identity, output length, finiteness, determinism, smoother
monotonicity) plus alloc-free verification (10,000 × 128 samples
wrapped in `assert_no_alloc`).

Added `libm = "0.2"` workspace dep for no_std-safe `powf`.

## Action Required

- [ ] Run automated gate sweep.
- [ ] Manually map the 7 acceptance-criteria bullets to the 13
      implemented tests.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 43/43 pass (+13 from M1.3)
- `cargo nextest run -p sfx-dsp` → 13/13 pass
- `pnpm -r typecheck` → 8 packages clean
- `pnpm test` → 5 vitest tests pass
- `pnpm --filter @soundsafe/roadmap-schema generate:check` → up to date

- Commit: `105cc45` ("M1.3 (FS-ISS-004): Transform trait + Gain envelope")
- Push: pushed to `origin/main` as commit `105cc45` on 2026-04-21.
