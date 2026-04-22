import { useEffect, useMemo, useState } from 'react';
import {
  AudioEngine,
  InMemoryHost,
  WebAudioHost,
  isWebAudioAvailable,
} from '@soundsafe/audio-graph-ts';
import {
  InMemoryOpfsIndex,
  InMemoryOpfsStore,
  PackClient,
  createRealRustcoreBridge,
} from '@soundsafe/pack-client';
import type { RustcoreBridge } from '@soundsafe/pack-client';
import { AudioServicesProvider, type AppServices } from './audio-context.js';
import { DisclaimerGate } from './components/DisclaimerGate.js';
import { M1Demo } from './components/M1Demo.js';
import { PanicStop } from './components/PanicStop.js';

const DISCLAIMER_KEY = 'soundsafe.disclaimer.v1.acknowledgedAt';

const SAMPLE_RATE = 48_000;
const BLOCK_SIZE = 128;
const WORKLET_URL = new URL('./worklet-bootstrap.ts', import.meta.url).href;
const BUNDLED_PUBLIC_KEY = new Uint8Array(32); // M1 stub; M2 replaces.

/**
 * Default `AppServices` for the shipped consumer app. Picks the
 * real browser stack (`WebAudioHost` + wasm-pack rust-core bridge)
 * when running in a COOP/COEP-isolated page that supports
 * `AudioContext` + `SharedArrayBuffer`, and falls back to in-memory
 * stubs otherwise (happy-dom test runs, legacy browsers). Callers
 * can still pass `services` directly to bypass auto-selection.
 */
function createDefaultServices(): AppServices {
  let engine: AudioEngine;
  let rustcore: RustcoreBridge;

  if (isWebAudioAvailable()) {
    engine = new AudioEngine(
      new WebAudioHost({
        workletUrl: WORKLET_URL,
        sampleRate: SAMPLE_RATE,
      }),
    );
    rustcore = createRealRustcoreBridge({
      // `rust-core` is the unscoped wasm-pack output — the package
      // name in `packages/rust-core/pkg/package.json`.
      loadModule: () => import('rust-core') as Promise<never>,
      sampleRate: SAMPLE_RATE,
      blockSize: BLOCK_SIZE,
      bundledPublicKey: BUNDLED_PUBLIC_KEY,
    });
  } else {
    engine = new AudioEngine(new InMemoryHost());
    rustcore = {
      verifyManifest: async () => 'hello',
      setPackKey: async () => {},
      decryptFile: async (c) => new Uint8Array(c),
      clearPackKey: async () => {},
    };
  }

  const packClient = new PackClient({
    fetch:
      globalThis.fetch?.bind(globalThis) ??
      (async () => new Response('', { status: 404 })),
    rustcore,
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
