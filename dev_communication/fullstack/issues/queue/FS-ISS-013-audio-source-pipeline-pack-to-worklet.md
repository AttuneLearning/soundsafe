# FS-ISS-013: Audio source pipeline — PackClient → AudioEngine → worklet

**Priority:** High
**Status:** QUEUED
**QA:** N/A
**Created:** 2026-04-29
**Started:** —
**Requested By:** Adam (M1-UAT closeout; missing wiring not covered by FS-ISS-007..011)
**Assigned To:** Fullstack-Dev

## Description

Wire decrypted audio bytes from `PackClient.openSound(packId, soundId)` through the `AudioEngine` and into the AudioWorklet processor so the engine actually has source samples to run through the Gain → Limiter → Ramp graph. Today the worklet receives roadmap-step JSON but no audio data: `openSound` / `openSoundStream` are exported by pack-client and exercised by pack-client's own tests, but no caller in `audio-graph-ts` or `consumer-app` consumes them. This is the difference between "the demo's state machine ticks correctly" and "pressing Play produces audible (or at least metered) output."

Per ADR-020, the worklet runs the real-time WASM. The decode path (Opus → PCM) belongs in a WASM call inside the worklet (or a pre-decode in the decrypt worker), so the SAB/postMessage protocol carries either compressed bytes or PCM frames — pick once and document. For M1 the hello-pack file is synthetic silence (4096 zero bytes per FS-ISS-010 spec), so this issue does not need a working Opus decoder; it needs the byte transport to be in place so M2 can drop a real codec in without re-architecting.

## Acceptance Criteria

### Engine ingest

- [ ] `AudioEngine` exposes a way to attach a `PackClient` (or the narrower `SoundReader` interface — `(packId, soundId) => Promise<ReadableStream<Uint8Array>>`) at `init()`. Do not bake a `PackClient` dependency into `audio-graph-ts`; pass a function or a small interface to avoid the package coupling.
- [ ] `AudioEngine.loadRoadmap(roadmap)` resolves each step's `source_id` against the attached reader and posts the bytes (or a transferable handle) to the worklet **before** emitting `STEP_STARTED`.
- [ ] If `source_id` is unresolvable, `loadRoadmap` rejects with a typed error (`SourceNotFoundError`) and the engine state remains `idle`. No partial loads.

### Worklet sample path

- [ ] Worklet `processor.ts` holds the current step's source bytes (or a ring of pending bytes) and feeds them into the WASM's `process_block` as the input buffer. For the M1 silence fixture, this means writing `0.0` floats; once a real codec is wired in M2, the same buffer path carries decoded PCM.
- [ ] The transport between main and worklet is one of: (a) one-shot `port.postMessage({ kind: 'sourceBytes', stepIndex, bytes }, [bytes.buffer])` with a Transferable `ArrayBuffer`, or (b) a SAB-backed source ring. Pick (a) for M1 — simpler, single-step roadmap; document the upgrade path to (b) when M2 needs streamed sources.
- [ ] After `panicStop` and `PANIC_FADE_COMPLETE`, the worklet zeros / discards any held source bytes (defense-in-depth — plaintext shouldn't sit around in worklet memory longer than a step).

### Consumer-app wiring

- [ ] `packages/consumer-app/src/App.tsx`'s `createDefaultServices()` plumbs `packClient.openSound` (or `openSoundStream`) into the `AudioEngine` factory. The `M1Demo` "Load Hello Pack" path remains `packClient.unlock('hello', MOCK_JWT)` → `engine.loadRoadmap(starterRoadmap)`; the engine handles source resolution internally.
- [ ] Manual browser flow on the production path: disclaimer ack → Load → Play → engine state goes `idle → ramping → playing` → Esc → `fading → panicked` within ~500 ms. The level meter reads `−∞ dBFS` throughout (silence source) — that's the expected M1 behavior; **do not** synthesize tones to make the meter move.

### Tests

- [ ] Vitest unit test for `AudioEngine.loadRoadmap` with an injected `SoundReader` stub: confirms bytes are posted to the worklet before `STEP_STARTED` resolves. Exercise the `SourceNotFoundError` rejection path too.
- [ ] Vitest unit test for the worklet's source-ingest message path (using the existing host-injection test architecture).
- [ ] Updated consumer-app `App.test.tsx` confirms the load flow now passes a real (non-`InMemory`) `SoundReader` on the production branch.
- [ ] Existing 45+ vitest tests and 81 cargo tests must still pass.

## Notes

- This is the wiring that FS-ISS-008's M1.7 spec implied (`openSound` "is consumed by `audio-graph-ts` to feed the worklet") but no issue ever explicitly closed. Filing it now so M1-UAT has a real audio path.
- Real Opus decoding is **out of scope** — that's M2 along with real pack content. M1's hello pack is silence; this issue ships the byte transport, not the codec.
- The dual-WASM model from ADR-020 still holds: pack-client's worker decrypts, audio-graph-ts's worklet processes. This issue does not collapse them.
- If the byte-transport contract is too painful to test in vitest (no real `AudioWorkletNode`), the integration coverage moves to FS-ISS-011's Playwright E2E (which can mock WebAudio at the boundary and assert engine state transitions). Document that explicitly in the Dev Response.

## Dependencies

- **FS-ISS-007** (rust-core wasm-bindgen surface) — already implemented.
- **FS-ISS-008** (audio-graph-ts AudioEngine + worklet) — must be QA-closed (take-4 currently pending manual review).
- **FS-ISS-012** is independent in code, but on the production browser path FS-ISS-013 reads from OPFS via `PackClient.openSound`, so FS-ISS-012 should land first to avoid a temporary in-memory-only path on the production branch.

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`pnpm -r typecheck`)
- [ ] Unit tests passed (`pnpm test`)
- [ ] Integration tests passed (manual browser flow on dev server)
- [ ] UAT tests passed — **this is the M1 UAT gate**: Adam-as-LPC walks through disclaimer → load → play → panic and confirms ramp/fade feel and panic UX

## Dev Response

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
