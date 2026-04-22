// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { PlatformProvider, createPlatform } from '@soundsafe/platform';
import { AudioEngine, InMemoryHost } from '@soundsafe/audio-graph-ts';
import {
  InMemoryOpfsIndex,
  InMemoryOpfsStore,
  PackClient,
} from '@soundsafe/pack-client';
import type { RustcoreBridge } from '@soundsafe/pack-client';
import { App } from '../App.js';

function renderApp(props: Parameters<typeof App>[0] = {}) {
  return render(
    <PlatformProvider platform={createPlatform()}>
      <App {...props} />
    </PlatformProvider>,
  );
}

// Polyfill SharedArrayBuffer for happy-dom (it runs without COI).
if (typeof globalThis.SharedArrayBuffer === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).SharedArrayBuffer = ArrayBuffer;
}

const DISCLAIMER_KEY = 'soundsafe.disclaimer.v1.acknowledgedAt';

function buildServices() {
  const host = new InMemoryHost();
  const engine = new AudioEngine(host);
  const rustcore: RustcoreBridge = {
    verifyManifest: async () => 'hello',
    setPackKey: async () => {},
    decryptFile: async (c) => new Uint8Array(c),
    clearPackKey: async () => {},
  };
  // A 32-byte key base64 for the in-memory entitlement endpoint.
  const KEY_B64 = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
  const envelope = {
    pack_id: 'hello',
    manifest_bytes_b64: globalThis.btoa('{"pack_id":"hello"}'),
    signature_bytes_b64: globalThis.btoa('\0'.repeat(64)),
    files: [
      {
        path: 'audio/01-bark.opus.enc',
        ciphertext_b64: globalThis.btoa('\0'.repeat(256)),
        nonce_b64: globalThis.btoa('\0'.repeat(12)),
        tag_b64: globalThis.btoa('\0'.repeat(16)),
      },
    ],
  };
  const stubFetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/entitlement')) {
      return new Response(JSON.stringify({ packKeyBase64: KEY_B64 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/packs/hello/')) {
      return new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;
  const packClient = new PackClient({
    fetch: stubFetch,
    rustcore,
    opfs: new InMemoryOpfsStore(),
    opfsIndex: new InMemoryOpfsIndex(),
    sha256: async () => 'stub',
  });
  return { engine, packClient, host };
}

beforeEach(() => {
  cleanup();
  localStorage.removeItem(DISCLAIMER_KEY);
  vi.restoreAllMocks();
});

describe('App disclaimer gate', () => {
  it('hides the M1 demo until the disclaimer is acknowledged', async () => {
    const { engine, packClient } = buildServices();
    renderApp({ services: { engine, packClient } });

    expect(screen.queryByTestId('m1-load')).toBeNull();
    expect(screen.getByRole('button', { name: /I understand. Continue./i })).toBeTruthy();
  });

  it('renders the M1 demo after a prior acknowledgement', () => {
    localStorage.setItem(DISCLAIMER_KEY, new Date().toISOString());
    const { engine, packClient } = buildServices();
    renderApp({ services: { engine, packClient } });
    expect(screen.getByTestId('m1-load')).toBeTruthy();
  });
});

describe('M1 demo wiring', () => {
  it('Play button is disabled before Load and enabled after it resolves', async () => {
    localStorage.setItem(DISCLAIMER_KEY, new Date().toISOString());
    const { engine, host, packClient } = buildServices();

    // Drive engine to 'idle' so loadRoadmapStep's `ready` latch resolves.
    void engine.init({
      sampleRate: 48_000,
      blockSize: 128,
      bundledPublicKey: new Uint8Array(32),
      workletUrl: 'about:blank',
      wasmUrl: 'about:blank',
    });
    host.emitInbound({ kind: 'ready' });

    renderApp({ services: { engine, packClient } });

    const play = screen.getByTestId('m1-play') as HTMLButtonElement;
    expect(play.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByTestId('m1-load'));
      // packClient.unlock awaits a fetch + several microtasks. Flush
      // the queue, then emit StepStarted so engine.loadRoadmap resolves.
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      host.emitInbound({
        kind: 'events',
        events: [{ kind: 'StepStarted', index: 0 }],
      });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(play.disabled).toBe(false);
  });

  it('panic-stop click forwards to engine.panicStop()', async () => {
    localStorage.setItem(DISCLAIMER_KEY, new Date().toISOString());
    const { engine, host, packClient } = buildServices();
    const spy = vi.spyOn(engine, 'panicStop');

    void engine.init({
      sampleRate: 48_000,
      blockSize: 128,
      bundledPublicKey: new Uint8Array(32),
      workletUrl: 'about:blank',
      wasmUrl: 'about:blank',
    });
    host.emitInbound({ kind: 'ready' });

    renderApp({ services: { engine, packClient } });

    fireEvent.click(screen.getByTestId('panic-stop'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('load routes through packClient.unlock before engine.loadRoadmap', async () => {
    localStorage.setItem(DISCLAIMER_KEY, new Date().toISOString());
    const { engine, host, packClient } = buildServices();
    const unlockSpy = vi.spyOn(packClient, 'unlock');
    const loadRoadmapSpy = vi.spyOn(engine, 'loadRoadmap');

    void engine.init({
      sampleRate: 48_000,
      blockSize: 128,
      bundledPublicKey: new Uint8Array(32),
      workletUrl: 'about:blank',
      wasmUrl: 'about:blank',
    });
    host.emitInbound({ kind: 'ready' });

    renderApp({ services: { engine, packClient } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('m1-load'));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      host.emitInbound({
        kind: 'events',
        events: [{ kind: 'StepStarted', index: 0 }],
      });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(unlockSpy).toHaveBeenCalledWith('hello', expect.any(String));
    expect(loadRoadmapSpy).toHaveBeenCalled();
    // unlock ran before loadRoadmap.
    const unlockOrder = unlockSpy.mock.invocationCallOrder[0] ?? -1;
    const loadOrder = loadRoadmapSpy.mock.invocationCallOrder[0] ?? -1;
    expect(unlockOrder).toBeGreaterThan(0);
    expect(loadOrder).toBeGreaterThan(unlockOrder);
  });

  it('renders playhead + peak-level indicators', async () => {
    localStorage.setItem(DISCLAIMER_KEY, new Date().toISOString());
    const { engine, host, packClient } = buildServices();
    void engine.init({
      sampleRate: 48_000,
      blockSize: 128,
      bundledPublicKey: new Uint8Array(32),
      workletUrl: 'about:blank',
      wasmUrl: 'about:blank',
    });
    host.emitInbound({ kind: 'ready' });
    renderApp({ services: { engine, packClient } });

    expect(screen.getByTestId('m1-playhead')).toBeTruthy();
    expect(screen.getByTestId('m1-level-db')).toBeTruthy();
    expect(screen.getByTestId('m1-engine-state')).toBeTruthy();
  });

  it('shows the Grounding button after PanicFadeComplete', async () => {
    localStorage.setItem(DISCLAIMER_KEY, new Date().toISOString());
    const { engine, host, packClient } = buildServices();

    void engine.init({
      sampleRate: 48_000,
      blockSize: 128,
      bundledPublicKey: new Uint8Array(32),
      workletUrl: 'about:blank',
      wasmUrl: 'about:blank',
    });
    host.emitInbound({ kind: 'ready' });

    renderApp({ services: { engine, packClient } });

    await act(async () => {
      host.emitInbound({
        kind: 'events',
        events: [{ kind: 'PanicFadeComplete' }],
      });
    });

    expect(screen.getByTestId('m1-grounding')).toBeTruthy();
  });
});
