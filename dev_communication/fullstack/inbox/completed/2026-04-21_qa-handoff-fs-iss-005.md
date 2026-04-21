# Message: FS-ISS-005 first QA handoff

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-21
**Type:** Request
**In-Response-To:** FS-ISS-005

## Subject

FS-ISS-005 (sfx-audio-graph chain + SPSC param ring) ready for QA.

## Summary

`AudioGraph` lands with ADR-015's "never disabled" type-level
invariant (rails required, no `Option`, no disable path) and ADR-020's
SPSC ring topology. Per-block order — drain ring → chain → ramp →
ceiling — is load-bearing: any transform added in M2 automatically
runs through the limiter.

- 256-slot `ArrayQueue<ParamMessage>` ring; `enqueue_param(&self, msg)
  -> Result<(), RingFull>` from any thread; drain cap 16/block.
- Per-sample linear ramp envelope `0 → 1` over `ramp_ms * SR / 1000`
  samples; re-primed on `reset()`.
- Symmetric hard-clip at `±10^(ceiling_dbfs/20)`.
- Scratch buffer allocated in `new()`; `process()` verified alloc-free
  over 10,000 × 128 blocks under `assert_no_alloc`.

## Action Required

- [ ] Run automated gate sweep.
- [ ] Manually map the acceptance-criteria bullets to the 10
      implemented tests.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 53/53 pass (+10 from M1.4)
- `cargo nextest run -p sfx-audio-graph` → 10/10 pass
- `pnpm -r typecheck` → 8 packages clean
- `pnpm test` → 5 vitest tests pass
- `pnpm --filter @soundsafe/roadmap-schema generate:check` → up to date

- Commit: `7ec3fd3` ("M1.4 (FS-ISS-005): audio-graph chain + SPSC param ring")
- Push: pushed to `origin/main` as commit `7ec3fd3` on 2026-04-21.
