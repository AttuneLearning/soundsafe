# FS-ISS-004: sfx-dsp Gain envelope transform

**Priority:** High
**Status:** QUEUE
**QA:** PENDING
**Created:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.3)
**Assigned To:** Fullstack-Dev

## Description

First real DSP transform. Implement a sample-accurate Gain envelope in `sfx-dsp` that conforms to the M1 `Transform` trait surface (`prepare`, `set_param`, `process`, `reset`). This lands the Transform trait itself alongside the first implementation — the M0 stub only hinted at the trait shape.

The Gain transform applies linear attenuation (or mild boost) with a smoother so parameter changes don't click. Used in M1.4 as the first node in the audio-graph chain, and in M1.9's consumer-app integration where "play a gain-attenuated dog bark" is the acceptance criterion.

Per ADR-016, transforms are sample-accurate and allocation-free in the audio callback. Per ADR-018, proptest invariants are mandatory for DSP code.

## Acceptance Criteria

- [ ] `Transform` trait defined in `sfx-dsp::transform` with at minimum: `prepare(&mut self, sample_rate: u32, max_block: usize)`, `set_param(&mut self, id: u16, value: f32, smoothing_ms: u16)`, `process(&mut self, input: &[f32], output: &mut [f32])`, `reset(&mut self)`, and `id() -> &'static str`.
- [ ] `Gain` struct in `sfx-dsp::transforms::gain` implementing `Transform`. Parameters:
  - `attenuation_db: f32` — range `−60.0` to `+6.0`, default `0.0` dB.
  - `smoothing_ms: u16` — range `0` to `500`, default `20` ms.
- [ ] `Gain::process` is allocation-free. Verified by a test that wraps execution in an `assert_no_alloc` block and runs ≥10,000 blocks of size 128.
- [ ] All applicable proptest invariants from the per-PR DSP review prompt (numbered per the plan):
  1. **Bypass identity.** `set_param(ATTENUATION_DB, 0.0); process(x)` equals `x` within 1e-6.
  2. **Output length invariance.** `out.len() == in.len()` for block sizes `n ∈ [1, 2048]`. Strategy must cover `1`, `127`, `128`, `129`, `1024`, `2048` explicitly.
  3. **Finiteness.** For any input in `[-1.0, 1.0]` and any legal params, output contains no NaN, no Inf.
  5. **Determinism.** Gain is stateful but deterministic: same sequence of `set_param` + `process` calls with same input → bit-identical output.
  7. **Smoother monotonicity.** A parameter change from `a` dB to `b` dB over `n` samples (where `n = smoothing_ms * sample_rate / 1000`) produces a monotonic envelope from `10^(a/20)` to `10^(b/20)` with no overshoot.
- [ ] Parameter ID constants exported as `pub const BYPASS: u16`, `pub const ATTENUATION_DB: u16`, `pub const SMOOTHING_MS: u16`. These are the stable ABI per ADR-016 — no renames without a deprecation path.
- [ ] `id()` returns `"gain"`.
- [ ] Invariant 4 (ceiling) is deferred to M1.4 (where the limiter is chained). Invariant 6 (alloc-free) is the allocation test in acceptance criterion above. Invariant 8 (reversal-involutive) and 9 (signature LFO rate) are not applicable to Gain.

## Notes

- Use workspace dep `num-traits` if you need `Float::max`/`min`.
- `assert_no_alloc` workspace dev-dep is already present (`crates/sfx-dsp/Cargo.toml`).
- The `Transform` trait lives in `sfx-dsp` because `sfx-signature` and `sfx-audio-graph` (future) will both need to implement/consume it. Keep the trait minimal — future transforms may add capability via super-traits rather than bloating this one.
- This phase does **not** introduce the limiter or ramp-up. Those belong to `sfx-safety` (M0-landed) and `sfx-audio-graph` (M1.4 chain composition).

## Dependencies

- None. Independent of M1.0–M1.2 (crypto pillar); can be worked in parallel with M1.1/M1.2 in principle.

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`cargo check --workspace`)
- [ ] Unit tests passed (`cargo nextest run -p sfx-dsp`)
- [ ] Integration tests passed (the proptest invariants above)
- [ ] UAT tests passed (n/a — no user-facing behavior)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
