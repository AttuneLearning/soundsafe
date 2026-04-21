import { useEffect, useState } from 'react';
import { usePlatform } from '@soundsafe/platform';
import { useAudioServices } from '../audio-context.js';

/**
 * Panic-stop button (ADR-015). Always visible in the header, always
 * reachable, always also bindable to `Esc`.
 *
 * M1: click handler and Esc keybind both call `engine.panicStop()`,
 * which latches the panic flag on the Rust side and emits a
 * bounded fade. The "fired" class flashes for 600 ms on each
 * invocation so the user sees the gesture registered.
 *
 * The Esc binding is registered with `allowInInputs: true` so the user
 * can panic out from a typing context. The web KeybindService blurs
 * the active element before invoking the handler.
 */
export function PanicStop(): JSX.Element {
  const platform = usePlatform();
  const { engine } = useAudioServices();
  const [flashedAt, setFlashedAt] = useState<number | null>(null);

  function triggerPanic(_source: 'click' | 'esc'): void {
    void engine.panicStop();
    setFlashedAt(Date.now());
  }

  useEffect(() => {
    const unsubscribe = platform.keybind.register(
      'panic',
      { key: 'Escape' },
      () => triggerPanic('esc'),
      { allowInInputs: true },
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, engine]);

  useEffect(() => {
    if (flashedAt === null) return;
    const t = window.setTimeout(() => setFlashedAt(null), 600);
    return () => window.clearTimeout(t);
  }, [flashedAt]);

  return (
    <button
      type="button"
      className={`panic-button${flashedAt !== null ? ' is-fired' : ''}`}
      onClick={() => triggerPanic('click')}
      aria-label="Panic stop — fades audio to silence over 500 milliseconds"
      aria-keyshortcuts="Escape"
      data-testid="panic-stop"
    >
      <span className="panic-label">Panic Stop</span>
      <span className="panic-meta">
        500 ms fade
        <kbd className="kbd">esc</kbd>
      </span>
    </button>
  );
}
