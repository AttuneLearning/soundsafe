# FS-ISS-005: sfx-audio-graph chain + lock-free param ring

**Priority:** High
**Status:** QUEUE
**QA:** PENDING
**Created:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.4)
**Assigned To:** Fullstack-Dev

## Description

Block-based audio graph that chains the first DSP node (Gain, from M1.3) with the always-on safety layers (ceiling limiter + ramp envelope, from `sfx-safety`) at the AudioWorklet's 128-frame quantum. Parameter changes from the UI/host come in via a lock-free SPSC ring (per ADR-020) and are drained by `process()` at each block boundary.

Per ADR-015, `SafetyRails` is a **required** field of the audio graph — not `Option`, not behind a flag. The type system enforces that every audio path runs through the limiter and ramp. This is what makes ADR-015's "never disabled" property real in the audio hot path.

## Acceptance Criteria

- [ ] `AudioGraph` struct in `sfx_audio_graph` with a constructor `AudioGraph::new(config: AudioGraphConfig, rails: SafetyRails, transforms: Vec<Box<dyn Transform>>) -> Self`. `rails` is a bare `SafetyRails`, not `Option<SafetyRails>`.
- [ ] `AudioGraphConfig { sample_rate: u32, block_size: usize }` with `block_size` pinned to 128 for the M1 path.
- [ ] `process(&mut self, input: &[f32], output: &mut [f32])` signature matches `Transform::process` contract (same length in/out).
- [ ] Per-block processing order: drain param ring (up to 16 messages) → run each transform in sequence → apply ramp envelope → apply ceiling limiter. The order is load-bearing; the limiter is post-chain so any new transform added to M2 automatically benefits.
- [ ] Lock-free SPSC ring for parameter changes:
  - Fixed size 256 entries, each a 16-byte record: `{ node_id: u16, param_id: u16, value: f32, smoothing_ms: u16, _pad: [u8; 6] }`.
  - Producer: a public `enqueue_param(&self, msg: ParamMessage) -> Result<(), RingFull>` method callable from any thread.
  - Consumer: `process()` drains the ring using `crossbeam-queue` or an equivalent SPSC primitive.
  - Overwrite semantics not required for M1 — if the ring is full, `enqueue_param` returns `Err(RingFull)`. v1.1 can revisit for overwrite-on-full.
- [ ] Parameter smoother per `(node_id, param_id)`: when a new param value arrives, the graph sets a smoothing target and linearly interpolates toward it over `smoothing_ms`. Default 20 ms for UI-driven params, 0 ms allowed for programmatic transitions.
- [ ] Allocation-free hot path: `process()` makes zero allocations. Verified via `assert_no_alloc` test running ≥10,000 blocks.
- [ ] Tests (via `sfx_test_fixtures` for audio input where needed):
  - Chain identity: with a single Gain at 0 dB + rails at defaults, `process(x)` equals `x` through the ramp-up period and beyond, within ramp+limiter tolerance.
  - Invariant 4 (ceiling respected): drive any input through the chain; `|out[i]| ≤ 10^(ceiling_dbfs/20) + 1e-6` for all `i` across all tested param combinations.
  - Smoother monotonicity: change Gain from `-20 dB` to `0 dB` over 20 ms; the resulting envelope is monotonic, no overshoot.
  - Ramp-up behavior (from `sfx-safety`): the first `ramp_ms` of output after a `reset()` is monotonic from 0 to full amplitude.
  - Ring drain: push 300 param messages in a tight loop; first 256 are accepted, rest return `RingFull`. Drain one block; subsequent pushes succeed.
- [ ] Documentation in `lib.rs` header references ADR-015 (rails required), ADR-020 (thread topology), ADR-016 (128-frame quantum).

## Notes

- `sfx-safety::SafetyRails` already exists (M0). This phase wires it into the graph.
- `sfx-dsp::Gain` from M1.3 is the only transform in the chain initially. M2 phases add the other 9 transforms.
- The param ring's SPSC assumption holds because there's exactly one producer (the AudioWorklet message handler) and one consumer (`process()`). If a future release needs multi-producer, upgrade to MPSC at that point.
- `atomic_float` workspace dep is for the smoother state if we need atomic f32 cross-thread. For the pure-Rust-side graph without worklet wiring yet, atomics may not be needed — use them only if required.

## Dependencies

- **M1.3 (FS-ISS-004)** — needs `sfx-dsp::Transform` trait + `Gain` to exist so the graph has something to chain.
- M0 — `sfx-safety::SafetyRails` already present.

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`cargo check --workspace`)
- [ ] Unit tests passed (`cargo nextest run -p sfx-audio-graph`)
- [ ] Integration tests passed (chain + ring tests above)
- [ ] UAT tests passed (n/a — no user-facing behavior yet)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
