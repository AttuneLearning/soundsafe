// M1 demo view: disclaimer → load hello pack → play → panic → grounding.
//
// Wiring verification screen — intentionally plain. Per FS-ISS-010 the
// load path exercises the real pack client (`unlock('hello', mockJwt)`)
// followed by `engine.loadRoadmap(starterRoadmap)`. Live playhead and
// peak-level indicators drive from the fast-ring-backed
// `useAudioEngine()` hook.

import { useCallback, useEffect, useState } from 'react';
import { useAudioEngine } from '@soundsafe/audio-graph-ts';
import { useAudioServices } from '../audio-context.js';

type LoadState = 'unloaded' | 'loading' | 'loaded' | 'failed';

const MOCK_JWT = 'm1.demo.mock-jwt';

const STARTER_ROADMAP = {
  id: 'hello',
  steps: [
    {
      source_id: 'dog-bark',
      transforms: [
        { kind: 'gain', params: [{ id: 1, value: -12 }, { id: 2, value: 20 }] },
      ],
      duration_ms: 30_000,
      advance_ms: 30_000,
    },
  ],
};

/**
 * Whether the default app-services fetch is pre-wired for
 * `unlock('hello', mockJwt)` (MSW in dev, real CDN in prod). The
 * consumer app's boot code installs MSW when `isWebAudioAvailable()`
 * is false (happy-dom tests) or when a demo flag is on.
 */

export function M1Demo(): JSX.Element {
  const { engine, packClient } = useAudioServices();
  const { state: engineState, playhead, levelDb } = useAudioEngine(engine);
  const [loadState, setLoadState] = useState<LoadState>('unloaded');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groundingVisible, setGroundingVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = engine.subscribe('PanicFadeComplete', () => {
      setGroundingVisible(true);
    });
    return unsubscribe;
  }, [engine]);

  const handleLoad = useCallback(async () => {
    setLoadState('loading');
    setLoadError(null);
    try {
      // Public 2-arg unlock path per FS-ISS-009: fetches the bundle
      // from the CDN (MSW in dev + test), exchanges the JWT, decrypts
      // via rust-core, writes OPFS. Throws on failure.
      await packClient.unlock('hello', MOCK_JWT);
      await engine.loadRoadmap(STARTER_ROADMAP);
      setLoadState('loaded');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setLoadState('failed');
    }
  }, [engine, packClient]);

  const handlePlay = useCallback(() => { void engine.play(); }, [engine]);
  const handlePause = useCallback(() => { void engine.pause(); }, [engine]);

  const playDisabled = loadState !== 'loaded' || engineState === 'panicked';
  const pauseDisabled = engineState !== 'playing';

  return (
    <section className="m1-demo" aria-labelledby="m1-demo-heading">
      <h1 id="m1-demo-heading">M1 demo · hello pack</h1>

      {/*
        Engine state and levelDb are rendered with data-testid hooks
        so the Playwright E2E (FS-ISS-011) can assert the full
        transition graph `idle → ramping → playing → fading → panicked`
        without needing an internal TS accessor.
      */}
      <p className="m1-demo__engine-state">
        Engine state: <strong data-testid="m1-engine-state">{engineState}</strong>
      </p>

      <div className="m1-demo__indicators" aria-live="polite">
        <span className="m1-demo__playhead">
          Playhead: <strong data-testid="m1-playhead">{playhead.toFixed(2)}s</strong>
        </span>
        <span className="m1-demo__level">
          Peak: <strong data-testid="m1-level-db">{formatLevel(levelDb)}</strong>
        </span>
      </div>

      <div className="m1-demo__controls">
        <button
          type="button"
          onClick={handleLoad}
          disabled={loadState === 'loading'}
          data-testid="m1-load"
        >
          {loadState === 'loading' ? 'Loading…' : 'Load Hello Pack'}
        </button>

        <button
          type="button"
          onClick={handlePlay}
          disabled={playDisabled}
          data-testid="m1-play"
          aria-disabled={playDisabled}
        >
          Play
        </button>

        <button
          type="button"
          onClick={handlePause}
          disabled={pauseDisabled}
          data-testid="m1-pause"
          aria-disabled={pauseDisabled}
        >
          Pause
        </button>
      </div>

      {loadError !== null && (
        <p className="m1-demo__error" role="alert" data-testid="m1-load-error">
          Load failed: {loadError}
        </p>
      )}

      {groundingVisible && (
        <button
          type="button"
          className="m1-demo__grounding"
          data-testid="m1-grounding"
          onClick={() => setGroundingVisible(false)}
        >
          Grounding
        </button>
      )}
    </section>
  );
}

function formatLevel(db: number): string {
  if (db <= -119) return '−∞ dBFS';
  return `${db.toFixed(1)} dBFS`;
}
