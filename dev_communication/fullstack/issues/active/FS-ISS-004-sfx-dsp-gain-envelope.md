# FS-ISS-004: sfx-dsp Gain envelope transform

**Priority:** High
**Status:** ACTIVE
**QA:** PENDING_MANUAL_REVIEW
**Created:** 2026-04-20
**Started:** 2026-04-21
**Requested By:** Fullstack-Dev (per m1-phases.md M1.3)
**Assigned To:** Fullstack-Dev

## Description

First real DSP transform. Implement a sample-accurate Gain envelope in `sfx-dsp` that conforms to the M1 `Transform` trait surface (`prepare`, `set_param`, `process`, `reset`). This lands the Transform trait itself alongside the first implementation — the M0 stub only hinted at the trait shape.

The Gain transform applies linear attenuation (or mild boost) with a smoother so parameter changes don't click. Used in M1.4 as the first node in the audio-graph chain, and in M1.9's consumer-app integration where "play a gain-attenuated dog bark" is the acceptance criterion.

Per ADR-016, transforms are sample-accurate and allocation-free in the audio callback. Per ADR-018, proptest invariants are mandatory for DSP code.

## Acceptance Criteria

- [x] `Transform` trait defined in `sfx-dsp::transform` with at minimum: `prepare(&mut self, sample_rate: u32, max_block: usize)`, `set_param(&mut self, id: u16, value: f32, smoothing_ms: u16)`, `process(&mut self, input: &[f32], output: &mut [f32])`, `reset(&mut self)`, and `id() -> &'static str`.
- [x] `Gain` struct in `sfx-dsp::transforms::gain` implementing `Transform`. Parameters:
  - `attenuation_db: f32` — range `−60.0` to `+6.0`, default `0.0` dB.
  - `smoothing_ms: u16` — range `0` to `500`, default `20` ms.
- [x] `Gain::process` is allocation-free. Verified by a test that wraps execution in an `assert_no_alloc` block and runs ≥10,000 blocks of size 128.
- [x] All applicable proptest invariants from the per-PR DSP review prompt (numbered per the plan):
  1. **Bypass identity.** `set_param(ATTENUATION_DB, 0.0); process(x)` equals `x` within 1e-6.
  2. **Output length invariance.** `out.len() == in.len()` for block sizes `n ∈ [1, 2048]`. Strategy must cover `1`, `127`, `128`, `129`, `1024`, `2048` explicitly.
  3. **Finiteness.** For any input in `[-1.0, 1.0]` and any legal params, output contains no NaN, no Inf.
  5. **Determinism.** Gain is stateful but deterministic: same sequence of `set_param` + `process` calls with same input → bit-identical output.
  7. **Smoother monotonicity.** A parameter change from `a` dB to `b` dB over `n` samples (where `n = smoothing_ms * sample_rate / 1000`) produces a monotonic envelope from `10^(a/20)` to `10^(b/20)` with no overshoot.
- [x] Parameter ID constants exported as `pub const BYPASS: u16`, `pub const ATTENUATION_DB: u16`, `pub const SMOOTHING_MS: u16`. These are the stable ABI per ADR-016 — no renames without a deprecation path.
- [x] `id()` returns `"gain"`.
- [x] Invariant 4 (ceiling) is deferred to M1.4 (where the limiter is chained). Invariant 6 (alloc-free) is the allocation test in acceptance criterion above. Invariant 8 (reversal-involutive) and 9 (signature LFO rate) are not applicable to Gain.

## Notes

- Use workspace dep `num-traits` if you need `Float::max`/`min`.
- `assert_no_alloc` workspace dev-dep is already present (`crates/sfx-dsp/Cargo.toml`).
- The `Transform` trait lives in `sfx-dsp` because `sfx-signature` and `sfx-audio-graph` (future) will both need to implement/consume it. Keep the trait minimal — future transforms may add capability via super-traits rather than bloating this one.
- This phase does **not** introduce the limiter or ramp-up. Those belong to `sfx-safety` (M0-landed) and `sfx-audio-graph` (M1.4 chain composition).

## Dependencies

- None. Independent of M1.0–M1.2 (crypto pillar); can be worked in parallel with M1.1/M1.2 in principle.

## Dev Handoff to QA

- [x] Development Complete
- [x] Awaiting QA
- [x] Typecheck passed (`cargo check --workspace`)
- [x] Unit tests passed (`cargo nextest run -p sfx-dsp` — 13/13)
- [x] Integration tests passed (proptest invariants 1, 2, 3, 5, 7)
- [x] UAT tests passed (n/a — no user-facing behavior)

### Implementation summary

- `crates/sfx-dsp/src/transform.rs`: full `Transform` trait surface
  (`prepare`, `set_param`, `process`, `reset`, `id`). Doc-block pins the
  audio-callback-safety contract and states params are smoothed per
  transform (advisory `smoothing_ms`).
- `crates/sfx-dsp/src/transforms/gain.rs`: `Gain` struct + `impl
  Transform`. Linear per-sample smoother with overshoot-clamp: when the
  next increment would cross the target, snap and zero the step. dB is
  clamped to `[-60.0, 6.0]`, smoothing to `[0, 500]` ms; non-finite dB
  values collapse to 0 dB. `BYPASS` param ID is exposed per spec (ID 0),
  even though the bypass identity invariant is demonstrated via
  `ATTENUATION_DB=0.0`.
- `crates/sfx-dsp/src/lib.rs`: module tree + re-export of `Transform`.
- `crates/sfx-dsp/Cargo.toml`: added `libm.workspace = true` for
  no_std-safe `powf` (dB → linear).
- `Cargo.toml` (workspace): added `libm = "0.2"` workspace dep.

### Tests

13 tests in `sfx-dsp` (all pass):

- Unit: `id_is_gain`, `bypass_identity_at_zero_db`,
  `bypass_param_passes_input_through`, `attenuation_clamps_to_bounds`,
  `smoothing_reaches_target_within_n_samples`,
  `smoothing_has_no_overshoot`, `process_is_allocation_free` (10,000
  blocks × 128 samples under `assert_no_alloc`),
  `set_param_is_allocation_free`.
- Proptest: `output_length_matches_input` (explicit cases 1, 127, 128,
  129, 1024, 2048 plus the range), `output_is_finite_for_bounded_input`,
  `bypass_identity_within_1e6`, `deterministic_for_same_input_sequence`,
  `smoother_is_monotonic_between_targets` (ascending + descending paths
  with target-reach check).

### Files changed

- `Cargo.toml` (workspace libm dep)
- `crates/sfx-dsp/Cargo.toml` (libm dep)
- `crates/sfx-dsp/src/lib.rs` (module + re-export)
- `crates/sfx-dsp/src/transform.rs` (new — full trait surface)
- `crates/sfx-dsp/src/transforms/mod.rs` (new)
- `crates/sfx-dsp/src/transforms/gain.rs` (new — Gain + tests)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**

## Dev Response (2026-04-21T07:45:00Z)

**Status:** Dev-complete; awaiting QA verification.

Implemented the full `Transform` trait surface and the `Gain` envelope
per M1.3 acceptance criteria. All 13 tests pass locally under nextest,
including the alloc-free guarantee (10,000 × 128-sample blocks wrapped
in `assert_no_alloc`) and the five required proptest invariants
(bypass identity, output length, finiteness, determinism, smoother
monotonicity).

Parameter-ID constants (`BYPASS=0`, `ATTENUATION_DB=1`, `SMOOTHING_MS=2`)
are the stable ABI per ADR-016. `id()` returns `"gain"`. Smoothing is a
per-sample linear envelope with overshoot-clamp: on the sample where
the next increment would cross the target, we snap to target and zero
the step. Smoothing of 0 ms snaps immediately.

No new runtime dependencies leak into production crates — `libm` is a
pure-Rust no-std math crate (the workspace was previously std-dependent
on `num-traits` only, but no code actually used num-traits yet; kept as
a workspace dep for future transforms that may want `Float::max` etc.).

Local gate verification (all green):
- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 43/43 pass (was 30/30 before M1.3; +13 new)
- `pnpm -r typecheck` → 8 packages clean
- `pnpm test` → 5 vitest tests pass
- `pnpm --filter @soundsafe/roadmap-schema generate:check` → up to date

- Files: `Cargo.toml`, `crates/sfx-dsp/Cargo.toml`, `crates/sfx-dsp/src/lib.rs`, `crates/sfx-dsp/src/transform.rs` (new), `crates/sfx-dsp/src/transforms/mod.rs` (new), `crates/sfx-dsp/src/transforms/gain.rs` (new, ~330 lines including tests).
- Commit: `105cc45` ("M1.3 (FS-ISS-004): Transform trait + Gain envelope")
- Push: pushed to `origin/main` as commit `105cc45` on 2026-04-21.

## QA Verification (2026-04-21T07:49:22Z)

- QA Verdict: Pending Manual Review
- Coverage Assessment: automated gates passed; manual acceptance-criteria mapping still required
- Manual Review: pending
- Gate Results: cargo check=PASS; pnpm typecheck=PASS; cargo nextest=PASS; pnpm test=PASS; schema check=PASS
- Commit/Push Evidence: present
