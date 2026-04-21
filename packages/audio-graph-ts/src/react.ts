// React integration for the AudioEngine.
//
// `useAudioEngine` returns the engine + reactive views of its state,
// playhead (samples), and post-limiter level (dBFS × 100). Reactivity
// is via `useSyncExternalStore` so the audio-thread fast-ring drives
// updates without prop-drilling or context rerenders.

import { useSyncExternalStore } from 'react';
import type { AudioEngine, AudioEngineState } from './AudioEngine.js';

export function useAudioEngineState(engine: AudioEngine): AudioEngineState {
  return useSyncExternalStore(
    (cb) => engine.subscribeState(cb),
    () => engine.currentState(),
    () => engine.currentState(),
  );
}

/**
 * Reactive playhead in seconds. Reads the most recent playhead value
 * from the fast ring; the caller decides when to poll (typically on
 * `requestAnimationFrame`).
 */
export function makePlayheadStore(engine: AudioEngine, sampleRate: number) {
  let samples = 0;

  return {
    subscribe(cb: () => void) {
      let rafId = 0;
      const tick = () => {
        const events = engine.pollFastRing();
        for (const ev of events) {
          if (ev.kind === 'playhead') {
            samples = ev.samples;
          }
        }
        cb();
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    },
    get(): number {
      return samples / sampleRate;
    },
  };
}

export function usePlayhead(engine: AudioEngine, sampleRate: number): number {
  const store = makePlayheadStore(engine, sampleRate);
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
