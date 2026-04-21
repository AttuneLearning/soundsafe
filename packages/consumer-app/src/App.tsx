import { useEffect, useMemo, useState } from 'react';
import { AudioEngine, InMemoryHost } from '@soundsafe/audio-graph-ts';
import {
  InMemoryOpfsIndex,
  InMemoryOpfsStore,
  PackClient,
} from '@soundsafe/pack-client';
import type { RustcoreBridge } from '@soundsafe/pack-client';
import { AudioServicesProvider, type AppServices } from './audio-context.js';
import { DisclaimerGate } from './components/DisclaimerGate.js';
import { M1Demo } from './components/M1Demo.js';
import { PanicStop } from './components/PanicStop.js';

const DISCLAIMER_KEY = 'soundsafe.disclaimer.v1.acknowledgedAt';

/**
 * Default AppServices used when the consumer app boots without an
 * injected override. The M1 demo wires an AudioEngine backed by
 * `InMemoryHost` (wire-up verification, not real audio — real
 * AudioWorklet wiring lands in M1.10's Playwright E2E per the issue
 * note) and a PackClient with in-memory OPFS stubs.
 *
 * Tests pass an override via `createApp({ services })`.
 */
function createDefaultServices(): AppServices {
  const host = new InMemoryHost();
  const engine = new AudioEngine(host);

  const noopRustcore: RustcoreBridge = {
    verifyManifest: async () => 'hello',
    setPackKey: async () => {},
    decryptFile: async (c) => new Uint8Array(c),
    clearPackKey: async () => {},
  };
  const packClient = new PackClient({
    fetch: globalThis.fetch?.bind(globalThis) ?? (async () => new Response('', { status: 404 })),
    rustcore: noopRustcore,
    opfs: new InMemoryOpfsStore(),
    opfsIndex: new InMemoryOpfsIndex(),
  });
  return { engine, packClient };
}

/**
 * App shell. In M0 this rendered a placeholder. M1 loads the demo
 * flow (Load Hello Pack → Play/Pause → panic → grounding).
 */
export function App({ services: injected }: { services?: AppServices } = {}): JSX.Element {
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);
  const services = useMemo(() => injected ?? createDefaultServices(), [injected]);

  useEffect(() => {
    setAcknowledgedAt(localStorage.getItem(DISCLAIMER_KEY));
  }, []);

  function acknowledge(): void {
    const ts = new Date().toISOString();
    localStorage.setItem(DISCLAIMER_KEY, ts);
    setAcknowledgedAt(ts);
  }

  return (
    <AudioServicesProvider services={services}>
      <div className="app-root">
        <header className="app-header">
          <div className="brand">
            Sound<span className="brand-dot">·</span>safe
            <span className="brand-tag">M1 · demo</span>
          </div>
          <PanicStop />
        </header>

        <main className="app-main">
          {acknowledgedAt ? (
            <M1Demo />
          ) : (
            <section className="placeholder">
              <h1>Welcome to Soundsafe</h1>
              <p>Acknowledge the disclaimer to continue.</p>
            </section>
          )}
        </main>

        {acknowledgedAt === null && <DisclaimerGate onAcknowledge={acknowledge} />}
      </div>
    </AudioServicesProvider>
  );
}
