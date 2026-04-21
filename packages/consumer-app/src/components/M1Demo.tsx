// M1 demo view: Load Hello Pack → Play/Pause → Panic-Stop → Grounding.
//
// Ugly on purpose — this is the wiring verification screen, not the
// Tier-3 UI (which lands in M2). Per FS-ISS-010 acceptance, no SUDS
// input, no chain editor, no library browser.

import { useCallback, useEffect, useState } from 'react';
import { useAudioEngineState } from '@soundsafe/audio-graph-ts';
import { useAudioServices } from '../audio-context.js';

type LoadState = 'unloaded' | 'loading' | 'loaded' | 'failed';

const STARTER_STEP_JSON = JSON.stringify({
  source_id: 'dog-bark',
  transforms: [
    {
      kind: 'gain',
      params: [
        { id: 1, value: -12.0 },
        { id: 2, value: 20 },
      ],
    },
  ],
  duration_ms: 30_000,
  advance_ms: 30_000,
});

export function M1Demo(): JSX.Element {
  const { engine } = useAudioServices();
  const engineState = useAudioEngineState(engine);
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
      await engine.loadRoadmapStep(STARTER_STEP_JSON);
      setLoadState('loaded');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setLoadState('failed');
    }
  }, [engine]);

  const handlePlay = useCallback(() => {
    void engine.play();
  }, [engine]);

  const handlePause = useCallback(() => {
    void engine.pause();
  }, [engine]);

  const playDisabled = loadState !== 'loaded' || engineState === 'panicked';
  const pauseDisabled = engineState !== 'playing';

  return (
    <section className="m1-demo" aria-labelledby="m1-demo-heading">
      <h1 id="m1-demo-heading">M1 demo · hello pack</h1>
      <p className="m1-demo__engine-state">
        Engine state: <strong>{engineState}</strong>
      </p>

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
        <p className="m1-demo__error" role="alert">
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
