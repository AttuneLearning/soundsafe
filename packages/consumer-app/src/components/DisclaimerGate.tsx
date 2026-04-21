import { useEffect, useRef } from 'react';

interface DisclaimerGateProps {
  onAcknowledge: () => void;
}

/**
 * First-run disclaimer modal (ADR-015). Focus-trapped, initial focus on a
 * "Read the disclaimer" link rather than the accept button — so users
 * cannot dismiss by Enter-mashing without reading.
 *
 * M0 variant: minimal but functional. The full a11y pass (focus-trap
 * library, aria-live announcements, reduced-motion handling) lands in M2
 * alongside the wider accessibility audit.
 */
export function DisclaimerGate({ onAcknowledge }: DisclaimerGateProps): JSX.Element {
  const readLinkRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    readLinkRef.current?.focus();
  }, []);

  return (
    <div
      className="disclaimer-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      aria-describedby="disclaimer-body"
    >
      <div className="disclaimer-card">
        <h2 id="disclaimer-title">Before you start</h2>
        <p id="disclaimer-body">
          Soundsafe is a self-guided sound-desensitization tool. It is not a
          substitute for therapy or medical care. If you are in crisis, please
          contact a qualified professional.
        </p>
        <p>
          The app plays sounds that may be distressing — it is designed to do
          so, gradually. A panic-stop button is always visible (top right) and
          fades audio to silence in 500 ms. Press it whenever you need to stop.
        </p>
        <p>
          Sound packs are encrypted and licensed for personal use within this
          app. Please respect the content license.
        </p>
        <p>
          <a
            ref={readLinkRef}
            href="#"
            onClick={(e) => e.preventDefault()}
            className="disclaimer-read-link"
          >
            Read the full disclaimer
          </a>
          <span className="disclaimer-read-link-hint">(opens in M2)</span>
        </p>
        <div className="disclaimer-actions">
          <button type="button" className="primary" onClick={onAcknowledge}>
            I understand. Continue.
          </button>
        </div>
      </div>
    </div>
  );
}
