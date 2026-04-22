// React integration for the AudioEngine.
//
// `useAudioEngine` returns the engine plus reactive views of its
// lifecycle state, playhead (seconds), and post-limiter level (dBFS).
// Reactivity is via `useSyncExternalStore` so the audio-thread
// fast-ring drives UI updates without prop-drilling or context
// re-renders.

import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { AudioEngine, AudioEngineState } from './AudioEngine.js';

export function useAudioEngineState(engine: AudioEngine): AudioEngineState {
  return useSyncExternalStore(
    (cb) => engine.subscribeState(cb),
    () => engine.currentState(),
    () => engine.currentState(),
  );
}

/**
 * Reactive playhead in seconds. Wraps an rAF loop over the engine's
 * fast-ring reader.
 */
export function usePlayhead(engine: AudioEngine): number {
  const storeRef = useRef<ReturnType<typeof makeLiveStore> | null>(null);
  if (!storeRef.current) storeRef.current = makeLiveStore(engine, 'playhead');
  const store = storeRef.current;
  const getSnapshot = useCallback(() => store.get(), [store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/**
 * Reactive post-limiter peak in dBFS. `-120` is the silence sentinel.
 */
export function useLevelDb(engine: AudioEngine): number {
  const storeRef = useRef<ReturnType<typeof makeLiveStore> | null>(null);
  if (!storeRef.current) storeRef.current = makeLiveStore(engine, 'levelDb');
  const store = storeRef.current;
  const getSnapshot = useCallback(() => store.get(), [store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** Combined hook: engine + state + playhead + levelDb. */
export function useAudioEngine(engine: AudioEngine): {
  engine: AudioEngine;
  state: AudioEngineState;
  playhead: number;
  levelDb: number;
} {
  const state = useAudioEngineState(engine);
  const playhead = usePlayhead(engine);
  const levelDb = useLevelDb(engine);
  return { engine, state, playhead, levelDb };
}

type LiveKind = 'playhead' | 'levelDb';

function makeLiveStore(engine: AudioEngine, kind: LiveKind): {
  subscribe: (cb: () => void) => () => void;
  get: () => number;
} {
  const listeners = new Set<() => void>();
  let rafId = 0;
  let running = false;
  let value = kind === 'levelDb' ? -120 : 0;

  const tick = (): void => {
    if (kind === 'playhead') {
      const next = engine.readPlayhead();
      if (next !== value) {
        value = next;
        for (const l of listeners) l();
      }
    } else {
      const next = engine.readLevelDb();
      if (next !== value) {
        value = next;
        for (const l of listeners) l();
      }
    }
    rafId = requestAnimationFrame(tick);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  };

  const stop = (): void => {
    running = false;
    cancelAnimationFrame(rafId);
  };

  return {
    subscribe(cb) {
      listeners.add(cb);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0) stop();
      };
    },
    get: () => value,
  };
}
