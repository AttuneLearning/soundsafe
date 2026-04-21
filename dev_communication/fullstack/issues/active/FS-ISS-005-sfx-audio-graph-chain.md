# FS-ISS-005: sfx-audio-graph chain + lock-free param ring

**Priority:** High
**Status:** ACTIVE
**QA:** PENDING_MANUAL_REVIEW
**Created:** 2026-04-20
**Started:** 2026-04-21
**Requested By:** Fullstack-Dev (per m1-phases.md M1.4)
**Assigned To:** Fullstack-Dev

## Description

Block-based audio graph that chains the first DSP node (Gain, from M1.3) with the always-on safety layers (ceiling limiter + ramp envelope, from `sfx-safety`) at the AudioWorklet's 128-frame quantum. Parameter changes from the UI/host come in via a lock-free SPSC ring (per ADR-020) and are drained by `process()` at each block boundary.

Per ADR-015, `SafetyRails` is a **required** field of the audio graph — not `Option`, not behind a flag. The type system enforces that every audio path runs through the limiter and ramp. This is what makes ADR-015's "never disabled" property real in the audio hot path.

## Acceptance Criteria

- [x] `AudioGraph` struct in `sfx_audio_graph` with a constructor `AudioGraph::new(config: AudioGraphConfig, rails: SafetyRails, transforms: Vec<Box<dyn Transform>>) -> Self`. `rails` is a bare `SafetyRails`, not `Option<SafetyRails>`.
- [x] `AudioGraphConfig { sample_rate: u32, block_size: usize }` with `block_size` pinned to 128 for the M1 path (`AudioGraphConfig::BLOCK_SIZE_M1` constant + `m1()` constructor).
- [x] `process(&mut self, input: &[f32], output: &mut [f32])` signature matches `Transform::process` contract (same length in/out).
- [x] Per-block processing order: drain param ring (up to 16 messages) → run each transform in sequence → apply ramp envelope → apply ceiling limiter.
- [x] Lock-free SPSC ring for parameter changes:
  - 256-entry `ArrayQueue<ParamMessage>` (`PARAM_RING_CAPACITY`).
  - `ParamMessage { node_id: u16, param_id: u16, value: f32, smoothing_ms: u16, _pad: [u8; 6] }` (16 bytes, `#[repr(C)]`).
  - Producer: `enqueue_param(&self, msg) -> Result<(), RingFull>`.
  - Consumer: `process()` drains up to 16 (`MAX_DRAIN_PER_BLOCK`).
  - Overwrite semantics not required for M1 — full ring returns `Err(RingFull)`.
- [x] Parameter smoothing is delegated to each `Transform::set_param` implementation (e.g. `Gain`'s per-sample linear smoother); the graph only routes the message.
- [x] Allocation-free hot path: the scratch buffer is allocated once in `new()`; `process()` runs under `assert_no_alloc` for 10,000 × 128-sample blocks.
- [x] Tests:
  - Chain identity: `chain_identity_small_input_post_ramp`.
  - Ceiling: `ceiling_respected_on_hot_input` (drives +6 dB × 0.95 input through the limiter).
  - Smoother monotonicity: `smoother_between_gain_targets_is_monotonic`.
  - Ramp-up: `ramp_up_is_monotonic_0_to_full`.
  - Ring drain: `ring_returns_ringfull_past_capacity` + `ring_accepts_again_after_drain`.
  - Plus: `rails_are_a_required_field`, `process_is_allocation_free`, `enqueue_from_shared_ref_is_allocation_free`, `unknown_node_id_is_ignored`.
- [x] Documentation in `lib.rs` header references ADR-015 (rails required), ADR-020 (thread topology), ADR-016 (128-frame quantum).

## Notes

- `sfx-safety::SafetyRails` already exists (M0). This phase wires it into the graph.
- `sfx-dsp::Gain` from M1.3 is the only transform in the chain initially. M2 phases add the other 9 transforms.
- The param ring's SPSC assumption holds because there's exactly one producer (the AudioWorklet message handler) and one consumer (`process()`). If a future release needs multi-producer, upgrade to MPSC at that point.
- `atomic_float` workspace dep is for the smoother state if we need atomic f32 cross-thread. For the pure-Rust-side graph without worklet wiring yet, atomics may not be needed — use them only if required.

## Dependencies

- **M1.3 (FS-ISS-004)** — needs `sfx-dsp::Transform` trait + `Gain` to exist so the graph has something to chain.
- M0 — `sfx-safety::SafetyRails` already present.

## Dev Handoff to QA

- [x] Development Complete
- [x] Awaiting QA
- [x] Typecheck passed (`cargo check --workspace`)
- [x] Unit tests passed (`cargo nextest run -p sfx-audio-graph` — 10/10)
- [x] Integration tests passed (chain + ring tests in the `tests` submodule)
- [x] UAT tests passed (n/a — no user-facing behavior yet)

## Dev Response (2026-04-21T07:55:55Z)

**Status:** Dev-complete; awaiting QA verification.

`AudioGraph` landed with the load-bearing per-block order: drain param
ring (≤16 msgs) → chain → ramp envelope → ceiling limiter. `SafetyRails`
is a bare required field — no `Option`, no disable path. The ramp
envelope is a per-sample linear `0 → 1` over `ramp_ms * SR / 1000`
samples; the ceiling limiter is a symmetric hard-clip at
`±10^(ceiling_dbfs/20)`.

The param ring is a 256-slot `crossbeam_queue::ArrayQueue` of
`ParamMessage` records (16 bytes, `#[repr(C)]`). Producer is
`enqueue_param(&self, msg) -> Result<(), RingFull>` from any thread;
consumer drains up to `MAX_DRAIN_PER_BLOCK = 16` per `process()` call.

Alloc-free verified — scratch is allocated once in `new()`, and
`process()` runs 10,000 × 128 blocks under `assert_no_alloc` while
messages are being consumed from the ring.

Local verification:
- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 53/53 pass (43 prior + 10 new)
- `cargo nextest run -p sfx-audio-graph` → 10/10 pass
- `pnpm -r typecheck` → 8 packages clean
- `pnpm test` → 5 vitest tests pass
- `pnpm --filter @soundsafe/roadmap-schema generate:check` → up to date

- Files: `crates/sfx-audio-graph/Cargo.toml` (libm dep), `crates/sfx-audio-graph/src/lib.rs` (full implementation; ~430 lines incl. tests), `Cargo.lock`.
- Commit: `7ec3fd3` ("M1.4 (FS-ISS-005): audio-graph chain + SPSC param ring")
- Push: pushed to `origin/main` as commit `7ec3fd3` on 2026-04-21.

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**

## QA Verification (2026-04-21T07:57:27Z)

- QA Verdict: Pending Manual Review
- Coverage Assessment: automated gates passed; manual acceptance-criteria mapping still required
- Manual Review: pending
- Gate Results: cargo check=PASS; pnpm typecheck=PASS; cargo nextest=PASS; pnpm test=PASS; schema check=PASS
- Commit/Push Evidence: present
