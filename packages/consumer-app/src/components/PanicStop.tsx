/**
 * Panic-stop button (ADR-015). Always visible in the header, always
 * reachable. M0 ships an inert variant: the button renders, has the right
 * affordance and keyboard hint, but does not yet call into the audio core
 * (which arrives in M1 via @soundsafe/audio-graph-ts).
 *
 * Real wiring per the plan:
 *   - KeybindService.register('panic', 'Escape', ..., { allowInInputs: true, global: true })
 *   - on click / Esc: AudioService.panicStop() — sets an atomic flag the
 *     Rust audio thread reads to begin a 500 ms fade.
 *   - haptic 'panic'.
 *   - presents grounding affordance after PANIC_FADE_COMPLETE event.
 */
export function PanicStop(): JSX.Element {
  function handleInert(): void {
    // M0 stub. M1 wires this to AudioService.panicStop().
    // eslint-disable-next-line no-console
    console.info('[panic-stop] M0 inert — wiring lands in M1');
  }

  return (
    <button
      type="button"
      className="panic-button"
      onClick={handleInert}
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
