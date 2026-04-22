import { describe, it, expect } from 'vitest';
import { AudioEngine, InMemoryHost } from '../AudioEngine.js';

function fakeConfig() {
  return {
    sampleRate: 48_000,
    blockSize: 128,
    bundledPublicKey: new Uint8Array(32),
    workletUrl: 'about:blank',
    wasmUrl: 'about:blank',
  };
}

describe('AudioEngine', () => {
  it('init sends an init message and resolves on ready', async () => {
    const host = new InMemoryHost();
    const engine = new AudioEngine(host);
    expect(engine.currentState()).toBe('uninitialized');

    const initPromise = engine.init(fakeConfig());

    // Worklet must have seen the init payload.
    expect(host.outbound[0]).toMatchObject({
      kind: 'init',
      sampleRate: 48_000,
      blockSize: 128,
    });
    expect(engine.currentState()).toBe('initializing');

    host.emitInbound({ kind: 'ready' });
    await initPromise;
    expect(engine.currentState()).toBe('idle');
  });

  it('setParam validates param paths', async () => {
    const host = new InMemoryHost();
    const engine = new AudioEngine(host);
    const initPromise = engine.init(fakeConfig());
    host.emitInbound({ kind: 'ready' });
    await initPromise;

    engine.setParam('chain[0].attenuation_db', -6, 20);
    const last = host.outbound.at(-1);
    expect(last).toMatchObject({
      kind: 'setParam',
      nodeId: 0,
      paramId: 1,
      value: -6,
      smoothingMs: 20,
    });

    expect(() => engine.setParam('chain[0].does_not_exist' as never, 0)).toThrow();
    expect(() => engine.setParam('not-a-path' as never, 0)).toThrow();
  });

  it('panicStop transitions through fading → panicked on PanicFadeComplete', async () => {
    const host = new InMemoryHost();
    const engine = new AudioEngine(host);
    const initPromise = engine.init(fakeConfig());
    host.emitInbound({ kind: 'ready' });
    await initPromise;

    const states: string[] = [engine.currentState()];
    engine.subscribeState((s) => states.push(s));

    const stopped = engine.panicStop();
    expect(engine.currentState()).toBe('fading');
    expect(host.outbound.at(-1)).toEqual({ kind: 'panicStop' });

    host.emitInbound({
      kind: 'events',
      events: [{ kind: 'PanicFadeComplete' }],
    });
    await stopped;

    expect(engine.currentState()).toBe('panicked');
    expect(states).toEqual(['idle', 'fading', 'panicked']);
  });

  it('panicStop is idempotent after the first call', async () => {
    const host = new InMemoryHost();
    const engine = new AudioEngine(host);
    const initPromise = engine.init(fakeConfig());
    host.emitInbound({ kind: 'ready' });
    await initPromise;

    const first = engine.panicStop();
    host.emitInbound({
      kind: 'events',
      events: [{ kind: 'PanicFadeComplete' }],
    });
    await first;

    const panicStopCountBefore = host.outbound.filter((m) => m.kind === 'panicStop').length;
    await engine.panicStop();
    const panicStopCountAfter = host.outbound.filter((m) => m.kind === 'panicStop').length;
    expect(panicStopCountAfter).toBe(panicStopCountBefore);
  });

  it('dispatches StepStarted subscribers from inbound events payload', async () => {
    const host = new InMemoryHost();
    const engine = new AudioEngine(host);
    const initPromise = engine.init(fakeConfig());
    host.emitInbound({ kind: 'ready' });
    await initPromise;

    const seen: number[] = [];
    engine.subscribe('StepStarted', (p) => seen.push(p.index));

    host.emitInbound({
      kind: 'events',
      events: [
        { kind: 'StepStarted', index: 0 },
        { kind: 'StepStarted', index: 1 },
      ],
    });

    expect(seen).toEqual([0, 1]);
  });

  it('unsubscribe stops delivery', async () => {
    const host = new InMemoryHost();
    const engine = new AudioEngine(host);
    const initPromise = engine.init(fakeConfig());
    host.emitInbound({ kind: 'ready' });
    await initPromise;

    let count = 0;
    const unsub = engine.subscribe('StepStarted', () => {
      count++;
    });
    host.emitInbound({ kind: 'events', events: [{ kind: 'StepStarted', index: 0 }] });
    unsub();
    host.emitInbound({ kind: 'events', events: [{ kind: 'StepStarted', index: 1 }] });
    expect(count).toBe(1);
  });
});
