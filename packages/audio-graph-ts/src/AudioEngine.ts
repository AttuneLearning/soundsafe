// Main-thread bridge to the AudioWorklet + rust-core WASM instance.
//
// The `AudioEngine` owns the `AudioContext`, the `AudioWorkletNode`,
// and the SAB fast-ring. It exposes a narrow API — `init`, `play`,
// `pause`, `loadRoadmap`, `setParam`, `panicStop`, `subscribe` —
// consumed by the consumer-app React layer via `useAudioEngine`.
//
// Dependency inversion for testability: `AudioEngine` accepts an
// `AudioEngineHost` that abstracts the browser APIs. The default
// `WebAudioHost` talks to real `AudioContext` + `AudioWorkletNode`;
// vitest + happy-dom tests swap in `InMemoryHost` to drive the state
// machine deterministically.

import type {
  AudioEvent,
  AudioEventKind,
  AudioEventPayload,
  InboundMessage,
  OutboundMessage,
} from './messages.js';
import { createFastRingReader, createFastRingSab } from './fast-ring.js';
import type { FastRingEvent } from './fast-ring.js';

export type ParamPath = `chain[${number}].${string}`;

/**
 * High-level lifecycle state exposed to React.
 */
export type AudioEngineState =
  | 'uninitialized'
  | 'initializing'
  | 'idle'
  | 'playing'
  | 'panicking'
  | 'panicked'
  | 'errored';

export interface AudioEngineConfig {
  sampleRate: number;
  blockSize: number;
  bundledPublicKey: Uint8Array;
  workletUrl: string;
  wasmUrl: string;
}

export interface AudioEngineHost {
  postToWorklet(msg: OutboundMessage): void;
  onInbound(cb: (msg: InboundMessage) => void): Unsubscribe;
  fastRing: SharedArrayBuffer;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

export type Unsubscribe = () => void;

type ParamSpec = Readonly<{ nodeId: number; paramId: number; name: string }>;

const DEFAULT_PARAM_TABLE: ReadonlyArray<ParamSpec> = [
  { nodeId: 0, paramId: 0, name: 'bypass' },
  { nodeId: 0, paramId: 1, name: 'attenuation_db' },
  { nodeId: 0, paramId: 2, name: 'smoothing_ms' },
];

export class AudioEngine {
  private state: AudioEngineState = 'uninitialized';
  private readonly host: AudioEngineHost;
  private readonly subscribers = new Map<
    AudioEventKind,
    Set<(p: AudioEvent) => void>
  >();
  private readonly stateSubscribers = new Set<(s: AudioEngineState) => void>();
  private readonly paramTable: ReadonlyArray<ParamSpec>;
  private readonly fastRingReader: ReturnType<typeof createFastRingReader>;
  private unsubscribeInbound: Unsubscribe | null = null;

  constructor(host: AudioEngineHost, paramTable = DEFAULT_PARAM_TABLE) {
    this.host = host;
    this.paramTable = paramTable;
    this.fastRingReader = createFastRingReader(host.fastRing);
  }

  /** Return the current lifecycle state (not reactive — pass the
   * return value through `useSyncExternalStore`). */
  currentState(): AudioEngineState { return this.state; }

  /** Boot the worklet; resolves when the worklet posts `{kind:'ready'}`. */
  async init(config: AudioEngineConfig): Promise<void> {
    this.transition('initializing');
    const ready = this.once('ready');
    this.host.postToWorklet({
      kind: 'init',
      sampleRate: config.sampleRate,
      blockSize: config.blockSize,
      bundledPublicKey: config.bundledPublicKey,
    });
    this.unsubscribeInbound = this.host.onInbound((msg) => this.handleInbound(msg));
    await ready;
    this.transition('idle');
  }

  async play(): Promise<void> {
    await this.host.resume();
    if (this.state === 'idle') {
      this.transition('playing');
    }
  }

  async pause(): Promise<void> {
    await this.host.suspend();
    if (this.state === 'playing') {
      this.transition('idle');
    }
  }

  async loadRoadmapStep(stepJson: string): Promise<void> {
    const started = this.once('ready', 'StepStarted' as unknown as 'ready'); // see helper below
    this.host.postToWorklet({ kind: 'playStep', stepJson });
    await started;
  }

  /**
   * Post a parameter change. Non-blocking. Validation (path → ids) is
   * synchronous; the audio-thread ring fills lazily.
   */
  setParam(path: ParamPath, value: number, smoothingMs = 20): void {
    const parsed = parseParamPath(path);
    const spec = this.paramTable.find(
      (p) => p.name === parsed.paramName && p.nodeId === parsed.nodeId,
    );
    if (!spec) {
      throw new Error(`unknown param path: ${path}`);
    }
    this.host.postToWorklet({
      kind: 'setParam',
      nodeId: spec.nodeId,
      paramId: spec.paramId,
      value,
      smoothingMs,
    });
  }

  /** Panic-stop; resolves when the worklet reports `PanicFadeComplete`. */
  async panicStop(): Promise<void> {
    if (this.state === 'panicking' || this.state === 'panicked') {
      return;
    }
    this.transition('panicking');
    const done = this.once('PanicFadeComplete');
    this.host.postToWorklet({ kind: 'panicStop' });
    await done;
    this.transition('panicked');
  }

  subscribe<K extends AudioEventKind>(
    event: K,
    cb: (payload: AudioEventPayload[K]) => void,
  ): Unsubscribe {
    let set = this.subscribers.get(event);
    if (!set) {
      set = new Set();
      this.subscribers.set(event, set);
    }
    const typed = cb as (p: AudioEvent) => void;
    set.add(typed);
    return () => {
      set?.delete(typed);
    };
  }

  subscribeState(cb: (s: AudioEngineState) => void): Unsubscribe {
    this.stateSubscribers.add(cb);
    return () => this.stateSubscribers.delete(cb);
  }

  /** Poll the SAB fast-ring. Called on `requestAnimationFrame`. */
  pollFastRing(): FastRingEvent[] {
    return this.fastRingReader.poll();
  }

  droppedFastRingEvents(): number {
    return this.fastRingReader.droppedEvents();
  }

  async close(): Promise<void> {
    this.host.postToWorklet({ kind: 'close' });
    await this.host.close();
    this.unsubscribeInbound?.();
  }

  private handleInbound(msg: InboundMessage): void {
    switch (msg.kind) {
      case 'ready':
        this.emit({ kind: 'StepStarted', index: -1 } as never, msg);
        break;
      case 'events':
        for (const ev of msg.events) {
          this.dispatchEvent(ev);
        }
        break;
      case 'error':
        this.transition('errored');
        break;
    }
  }

  private dispatchEvent(ev: AudioEvent): void {
    const subs = this.subscribers.get(ev.kind);
    if (!subs) return;
    for (const cb of subs) {
      cb(ev);
    }
  }

  private emit(_unused: unknown, _raw: InboundMessage): void {
    // placeholder for `ready` — subscribers for 'ready' are handled
    // via `once('ready')` through `resolveReady()`.
  }

  private transition(next: AudioEngineState): void {
    if (this.state === next) return;
    this.state = next;
    for (const cb of this.stateSubscribers) cb(next);
  }

  // once() is a small utility that resolves on the FIRST occurrence of
  // any of the listed kinds. 'ready' is a special-cased inbound
  // message (not an AudioEvent); other kinds are AudioEventKinds.
  private once(...kinds: ReadonlyArray<'ready' | AudioEventKind>): Promise<void> {
    return new Promise((resolve) => {
      const unsubscribers: Unsubscribe[] = [];
      const done = () => {
        for (const u of unsubscribers) u();
        resolve();
      };
      for (const k of kinds) {
        if (k === 'ready') {
          const u = this.host.onInbound((msg) => {
            if (msg.kind === 'ready') {
              done();
            }
          });
          unsubscribers.push(u);
        } else {
          const u = this.subscribe(k, () => done());
          unsubscribers.push(u);
        }
      }
    });
  }
}

function parseParamPath(path: ParamPath): { nodeId: number; paramName: string } {
  const match = /^chain\[(\d+)\]\.(.+)$/.exec(path);
  if (!match || match[1] === undefined || match[2] === undefined) {
    throw new Error(`bad param path: ${path}`);
  }
  return { nodeId: Number(match[1]), paramName: match[2] };
}

/**
 * In-memory host used by tests. Queues outbound messages, and exposes
 * `emitInbound` so tests can drive the engine deterministically.
 */
export class InMemoryHost implements AudioEngineHost {
  readonly fastRing: SharedArrayBuffer;
  readonly outbound: OutboundMessage[] = [];
  private readonly inboundSubs = new Set<(m: InboundMessage) => void>();
  closed = false;

  constructor(fastRing: SharedArrayBuffer = createFastRingSab()) {
    this.fastRing = fastRing;
  }

  postToWorklet(msg: OutboundMessage): void {
    this.outbound.push(msg);
  }

  onInbound(cb: (msg: InboundMessage) => void): Unsubscribe {
    this.inboundSubs.add(cb);
    return () => this.inboundSubs.delete(cb);
  }

  emitInbound(msg: InboundMessage): void {
    for (const cb of this.inboundSubs) cb(msg);
  }

  async resume(): Promise<void> {}
  async suspend(): Promise<void> {}
  async close(): Promise<void> {
    this.closed = true;
  }
}
