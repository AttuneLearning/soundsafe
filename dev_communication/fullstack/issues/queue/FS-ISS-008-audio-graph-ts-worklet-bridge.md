# FS-ISS-008: @soundsafe/audio-graph-ts AudioWorklet + WASM bridge + fast-ring

**Priority:** High
**Status:** QUEUE
**QA:** PENDING
**Created:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.7)
**Assigned To:** Fullstack-Dev

## Description

TypeScript-side bridge from React to the Rust/WASM audio core. The `AudioEngine` class wraps `AudioContext`, loads the `rust-core` WASM module into an `AudioWorkletProcessor`, and exposes a narrow API (`play`, `pause`, `loadRoadmap`, `setParam`, `panicStop`, `subscribe`) that React components consume via a `useAudioEngine()` hook.

Per ADR-020, the worklet owns the real-time WASM instance. Parameter changes from the UI are delivered via `AudioWorkletNode.port.postMessage` → worklet message handler → lock-free SPSC ring → `process()` drain. Audio-accurate events from Rust (playhead ticks, step-advance, panic-complete) surface via a `SharedArrayBuffer`-backed fast ring read from the main thread on `requestAnimationFrame`.

## Acceptance Criteria

- [ ] `AudioEngine` class in `packages/audio-graph-ts/src/AudioEngine.ts`:
  - `async init(): Promise<void>` — creates `AudioContext`, registers the worklet module at `./worklet/processor.js`, instantiates `AudioWorkletNode`, loads the `rust-core` WASM via `wasm-pack`'s web target, and allocates the SAB for the fast-ring events.
  - `async play(): Promise<void>` — resumes the audio context.
  - `async pause(): Promise<void>`.
  - `async loadRoadmap(roadmap: Roadmap): Promise<void>` — parses the roadmap (uses `@soundsafe/roadmap-schema` Zod) and posts a `playStep` message to the worklet for step 0. Awaits the `STEP_STARTED` event before resolving.
  - `setParam(path: ParamPath, value: number, smoothingMs?: number): void` — posts a `setParam` message to the worklet. Non-blocking; no await. `ParamPath` is a typed string like `chain[0].attenuation_db` that resolves to a `(node_id, param_id)` pair.
  - `panicStop(): Promise<void>` — posts a `panicStop` message. Returns when the `PANIC_FADE_COMPLETE` event arrives on the slow channel.
  - `subscribe<E extends AudioEvent>(event: E, cb: (payload: AudioEventPayload[E]) => void): Unsubscribe`.
  - `readPlayhead(): number` — synchronous read from the fast ring (returns seconds since step start).
  - `readLevelDb(): number` — synchronous read (post-limiter peak).
- [ ] Worklet script at `packages/audio-graph-ts/src/worklet/processor.ts`:
  - Loads the WASM module (path injected at bundle time).
  - `process(inputs, outputs)` calls the WASM's `process_block(in_ptr, out_ptr, n_frames)` per invocation.
  - `port.onmessage` enqueues messages into the WASM's lock-free ring.
  - Periodically polls the WASM's event queue and either posts structured events via `port.postMessage` (slow channel) or writes 16-byte records into the SAB fast ring (for audio-accurate events).
- [ ] Fast-ring reader at `packages/audio-graph-ts/src/fast-ring.ts`:
  - SAB layout documented: `[u32 writer_pos, u32 reader_pos, u32 dropped_events, ..., 256 × 16-byte records]`.
  - Reader uses `Atomics.load` on `writer_pos` and `Atomics.store` on `reader_pos`; no locking.
  - `createFastRingReader(sab: SharedArrayBuffer): { poll(): FastRingEvent[] }` — called on each `requestAnimationFrame` from the main thread.
- [ ] `useAudioEngine()` React hook in `packages/audio-graph-ts/src/react.ts`:
  - Returns `{ engine: AudioEngine, playhead: number, levelDb: number, state: 'idle' | 'ramping' | 'playing' | 'fading' | 'panicked' }`.
  - `playhead` and `levelDb` are backed by `useSyncExternalStore` on the fast ring — real-time updates without React rerender storms.
- [ ] COOP/COEP headers confirmed present in `packages/consumer-app/vite.config.ts` (already landed in M0). If not, this phase adds them.
- [ ] Vitest unit tests for:
  - Message encoding/decoding helpers (postMessage payloads round-trip through the TS type system).
  - Fast-ring reader: write known records into a `SharedArrayBuffer`, `poll()` returns them in order, dropped-events counter increments correctly on overflow.
  - `useAudioEngine` hook's state transitions given mocked engine events.
- [ ] Full integration (actually driving audio through the browser) is covered in M1.9 (consumer-app integration) and M1.10 (Playwright E2E), not here.

## Notes

- `rust-core` is consumed as a workspace path dep via pnpm. After `wasm-pack build packages/rust-core --target web --out-dir pkg`, the `pkg/` directory is a JS/TS module `audio-graph-ts` imports.
- CSS / React component styling is **not** in scope — this phase ships the service layer only. Components land in M1.9.
- This phase uses `@soundsafe/roadmap-schema` for input validation on `loadRoadmap`. That's the M0 hand-written stub. If M2's generator pipeline has run before this, use the generated types.
- AudioWorklet requires the page be served with COOP/COEP headers to access `SharedArrayBuffer`. The Vite config has them; if serving via another setup later, document the requirement.

## Dependencies

- **M1.6 (FS-ISS-007)** — `rust-core` wasm-bindgen surface.
- M0 — `@soundsafe/platform` (for the `AudioService` interface shape, once we tidy it).
- M0 — `@soundsafe/roadmap-schema` stub.

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`pnpm -r typecheck`)
- [ ] Unit tests passed (`pnpm --filter @soundsafe/audio-graph-ts test`)
- [ ] Integration tests passed (worklet boot verified in dev server, see Notes)
- [ ] UAT tests passed (n/a — consumed by M1.9)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
