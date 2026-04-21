// @soundsafe/audio-graph-ts — Web Audio + AudioWorklet + WASM bridge.
//
// Public surface consumed by the consumer app's React layer. The
// AudioWorkletProcessor (`src/worklet/processor.ts`) is NOT re-exported
// — it's loaded at runtime via `audioContext.audioWorklet.addModule`.

export {
  AudioEngine,
  InMemoryHost,
} from './AudioEngine.js';
export type {
  AudioEngineConfig,
  AudioEngineHost,
  AudioEngineState,
  ParamPath,
  Unsubscribe,
} from './AudioEngine.js';
export type {
  AudioEvent,
  AudioEventKind,
  AudioEventPayload,
  InboundMessage,
  OutboundMessage,
} from './messages.js';
export { parseEventsJson } from './messages.js';
export {
  RECORD_COUNT,
  RECORD_SIZE_BYTES,
  createFastRingReader,
  createFastRingSab,
  createFastRingWriter,
  KIND_LEVEL_DB,
  KIND_LIMITER_HIT,
  KIND_PLAYHEAD,
  KIND_RAMP_DONE,
} from './fast-ring.js';
export type { FastRingEvent } from './fast-ring.js';
export { makePlayheadStore, useAudioEngineState, usePlayhead } from './react.js';
