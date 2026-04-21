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
  const packClient = new PackClient({
    fetch: (async () => new Response('', { status: 404 })) as typeof fetch,
    rustcore,
    opfs: new InMemoryOpfsStore(),
    opfsIndex: new InMemoryOpfsIndex(),
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
      // loadRoadmapStep awaits the next 'ready' inbound OR a StepStarted event.
      host.emitInbound({ kind: 'ready' });
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
