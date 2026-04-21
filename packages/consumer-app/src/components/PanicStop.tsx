import { useEffect, useState } from 'react';
import { usePlatform } from '@soundsafe/platform';

/**
 * Panic-stop button (ADR-015). Always visible in the header, always
 * reachable, always also bindable to `Esc`.
 *
 * M0: the click handler and the Esc keybind both fire `triggerPanic()`,
 * which logs to the console and flashes a brief "panic stop ready" notice.
 * M1 swaps `triggerPanic()` to call `AudioService.panicStop()` (atomic
 * flag → 500 ms Rust-side fade → grounding preload).
 *
 * The Esc binding is registered with `allowInInputs: true` so the user can
 * panic out from a typing context. The web KeybindService blurs the active
 * element before invoking the handler so the next keystroke does not
 * continue editing.
 */
export function PanicStop(): JSX.Element {
  const platform = usePlatform();
  const [flashedAt, setFlashedAt] = useState<number | null>(null);

  function triggerPanic(_source: 'click' | 'esc'): void {
    // M0 stub. M1 wires this to AudioService.panicStop().
    // eslint-disable-next-line no-console
    console.info('[panic-stop] M0 inert — wiring lands in M1');
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
  }, [platform]);

  // Fade the "fired" flash after 600 ms.
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
    >
      <span className="panic-label">Panic Stop</span>
      <span className="panic-meta">
        500 ms fade
        <kbd className="kbd">esc</kbd>
      </span>
    </button>
  );
}
