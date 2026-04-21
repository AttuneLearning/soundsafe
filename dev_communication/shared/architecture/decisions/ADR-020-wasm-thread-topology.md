# ADR-020: WASM thread topology — AudioWorklet + Decrypt Worker

**Status:** Accepted
**Date:** 2026-04-20
**Domain:** Audio

## Context

The Rust/WASM core (per ADR-002, ADR-016) must do two kinds of work: (1) real-time DSP + safety enforcement + roadmap advance, which must never block or allocate in the audio callback; and (2) AES-256-GCM pack decryption (per ADR-010), which is CPU-heavy but not real-time and must not stall the main thread during pack load.

Running both in a single WASM instance on the main thread is wrong: decryption of an 80 MB pack blocks React renders and the UI freezes during pack switch. Running both in the audio worklet is also wrong: bulk decryption on the audio thread causes buffer underruns. Running DSP on the main thread is out of the question — jank immediately translates to audible drops.

The question is the thread layout.

## Decision

**Two WASM instances, one per thread.**

1. **Real-time audio instance (WASM A) lives in an `AudioWorkletProcessor`.** Owns `sfx-audio-graph`, `sfx-roadmap-engine`, `sfx-safety`. Processes 128-frame blocks. Never allocates in `process()`.
2. **Decrypt-worker instance (WASM B) lives in a dedicated Web Worker.** Owns `sfx-pack-vault` for bulk decryption to OPFS. Runs once per pack load.

Main thread → worklet communication uses `AudioWorkletNode.port.postMessage`. The worklet's message handler enqueues into a **lock-free SPSC ring** consumed by `process()` at most 16 entries per block. Main thread never calls the real-time WASM directly.

Worklet → main communication uses a **two-tier channel**:
- **Fast ring** — a `SharedArrayBuffer`-backed SPSC ring of 16-byte records (256 entries, overwrite-on-full with a `dropped_events` counter). Used for audio-accurate events (`PROGRESS_TICK`, `CLIP_WARN`, `SAFETY_BLOCKED`, `STEP_ADVANCED`, `PANIC_FADE_COMPLETE`). Written with `Atomics.store`, read from main on `requestAnimationFrame`.
- **Slow channel** — `worklet.port.postMessage` for variable-size structured payloads (`STEP_COMPLETED` with SUDS history, `SUDS_REQUESTED`, `SAFETY_CONFIG_APPLIED`, `PACK_KEY_ZEROIZED`).

Decrypt worker uses plain `postMessage` for progress (non-audio-critical) and transfers decrypted buffers to OPFS directly via the FileSystemAccess API; it does not share memory with WASM A in v1.

## Consequences

### Positive
- Audio callback is protected from pack-load work; no underruns during pack switch.
- Main thread is free of crypto work; React renders stay smooth.
- Parameter changes round-trip in <1 block regardless of UI freeze.
- Event channel separation (fast ring vs. slow port) keeps audio-accurate events off the JS runtime's macrotask queue.

### Negative / trade-offs
- Two WASM instances = two copies of the core in memory (~600 KB gzip budget each). Some duplication of constants.
- SharedArrayBuffer requires cross-origin-isolated hosting (`COOP: same-origin`, `COEP: require-corp`). This is a hosting-configuration gate.
- Lock-free ring implementation must be carefully written and reviewed; incorrect memory ordering silently corrupts events.

### Neutral / to watch
- Streaming decrypt in the worklet is a reserved future option (for memory-constrained devices). If adopted, the pack key transits worker→worklet via a dedicated SAB region rather than bulk-decrypting to OPFS. v1 does not ship this.
- The `dropped_events` counter surfaces in DevTools only, never UI. If it ever increments in normal use the ring is undersized.

## Alternatives considered

- **Single WASM instance on main thread.** Rejected: bulk decrypt blocks React; real-time audio in `setInterval` jitters.
- **All WASM in worklet.** Rejected: bulk decrypt on audio thread causes buffer underruns.
- **No worklet, use `ScriptProcessorNode`.** Rejected: deprecated; fires on main thread; ~100 ms of buffering is unusable for ramp-sensitive audio.
- **Direct wasm-bindgen JS callbacks from `process()` to main.** Rejected: allocates on every call; can re-enter the JS runtime at audio priority.

## References

- ADR-002 (React + TS + wasm-bindgen)
- ADR-010 (per-pack AES-256-GCM; keys in WASM linear memory)
- ADR-016 (sample-accurate, allocation-free transforms)
- ADR-018 (TDD + wasm-bindgen-test for the boundary)
- `sound-delivery.md §3` (key flow)
- Plan: `/home/adam/.claude/plans/distributed-napping-lemon.md` §Rust↔TS boundary
