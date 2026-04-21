import { useEffect, useState } from 'react';
import { DisclaimerGate } from './components/DisclaimerGate';
import { PanicStop } from './components/PanicStop';

const DISCLAIMER_KEY = 'soundsafe.disclaimer.v1.acknowledgedAt';

/**
 * App shell for M0. Renders the disclaimer gate over a placeholder
 * "workspace coming in M1" screen, with a persistent (inert) panic-stop
 * button in the header so the affordance is exercised from day one.
 */
export function App(): JSX.Element {
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);

  useEffect(() => {
    setAcknowledgedAt(localStorage.getItem(DISCLAIMER_KEY));
  }, []);

  function acknowledge(): void {
    const ts = new Date().toISOString();
    localStorage.setItem(DISCLAIMER_KEY, ts);
    setAcknowledgedAt(ts);
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="brand">
          Sound<span className="brand-dot">·</span>safe
          <span className="brand-tag">M0 · scaffold</span>
        </div>
        <PanicStop />
      </header>

      <main className="app-main">
        <section className="placeholder">
          <h1>Workspace lands in M1</h1>
          <p>
            This screen is the M0 milestone exit: scaffolding compiles, the
            disclaimer gate works, and the panic-stop affordance is mounted.
            The Tier-3 workspace from
            <code> dev_communication/shared/specs/mockups/tier-3-interactive.html </code>
            replaces this placeholder during M2.
          </p>
          {acknowledgedAt && (
            <p className="ack">
              Disclaimer acknowledged at <time>{acknowledgedAt}</time>.
            </p>
          )}
        </section>
      </main>

      {acknowledgedAt === null && <DisclaimerGate onAcknowledge={acknowledge} />}
    </div>
  );
}
