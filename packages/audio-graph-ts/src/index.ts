// @soundsafe/audio-graph-ts — Web Audio + AudioWorklet + WASM bridge.
//
// Sole owner of the `crossOriginIsolated` headers contract (for SAB) and
// AudioWorklet module registration. Wraps `rust-core` (the WASM artifact
// from packages/rust-core via wasm-pack).
//
// Lands in M1: AudioEngine class, useAudioEngine() React hook, fast-ring
// reader for playhead/level, panic-stop atomic flag.

export const __PACKAGE_NAME = '@soundsafe/audio-graph-ts';
