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

import { Manifest as RoadmapZod } from '@soundsafe/roadmap-schema';
import type {
  AudioEvent,
  AudioEventKind,
  AudioEventPayload,
  InboundMessage,
  OutboundMessage,
} from './messages.js';
import { createFastRingReader, createFastRingSab } from './fast-ring.js';
import type { FastRingEvent } from './fast-ring.js';
import { WebAudioHost } from './WebAudioHost.js';

export type ParamPath = `chain[${number}].${string}`;

/**
 * High-level lifecycle state exposed to React. The `idle → ramping
 * → playing → fading → panicked` quintet is the FS-ISS-008 contract;
 * `uninitialized` / `initializing` / `errored` extend the set to
 * cover boot + error paths without breaking the spec.
 */
export type AudioEngineState =
  | 'uninitialized'
  | 'initializing'
  | 'idle'
  | 'ramping'
  | 'playing'
  | 'fading'
  | 'panicked'
  | 'errored';

export interface AudioEngineConfig {
  sampleRate: number;
  blockSize: number;
  bundledPublicKey: Uint8Array;
  workletUrl: string;
  wasmUrl: string;
  /**
   * Optional ramp-up duration in ms. Defaults to 3000 (ADR-015).
   * Pinned per session; live-tunable rails are a Tier-2 concern.
   */
  rampMs?: number;
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
  private host: AudioEngineHost | null;
  private fastRingReader: ReturnType<typeof createFastRingReader> | null = null;
  private readonly subscribers = new Map<
    AudioEventKind,
    Set<(p: AudioEvent) => void>
  >();
  private readonly stateSubscribers = new Set<(s: AudioEngineState) => void>();
  private readonly paramTable: ReadonlyArray<ParamSpec>;
  private unsubscribeInbound: Unsubscribe | null = null;
  private samples = 0;
  private levelDb = -120;
  private sampleRate = 48_000;
  private rampMs = 3_000;
  private rampTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Pass a host for tests (e.g. `InMemoryHost`) or omit to let
   * `init()` own the full browser/worklet boot path via an internal
   * `WebAudioHost` (the production path — FS-ISS-008).
   */
  constructor(host?: AudioEngineHost, paramTable = DEFAULT_PARAM_TABLE) {
    this.host = host ?? null;
    this.paramTable = paramTable;
    if (host) {
      this.fastRingReader = createFastRingReader(host.fastRing);
    }
  }

  /** Return the current lifecycle state (not reactive — pass the
   * return value through `useSyncExternalStore`). */
  currentState(): AudioEngineState { return this.state; }

  private requireHost(): AudioEngineHost {
    if (!this.host) {
      throw new Error('AudioEngine: call init(...) before using the engine.');
    }
    return this.host;
  }

  /**
   * Boot the audio stack. Per FS-ISS-008, `AudioEngine` owns:
   *   1. `AudioContext` creation (via `WebAudioHost`),
   *   2. `audioWorklet.addModule(workletUrl)` registration,
   *   3. `AudioWorkletNode` instantiation,
   *   4. WASM load via the worklet's `init` handler, and
   *   5. the fast-ring SAB allocation.
   *
   * When the caller supplied a host to the constructor (tests),
   * `init()` reuses it and skips the `WebAudioHost` path.
   */
  async init(config: AudioEngineConfig): Promise<void> {
    this.sampleRate = config.sampleRate;
    this.rampMs = config.rampMs ?? 3_000;
    if (!this.host) {
      this.host = new WebAudioHost({
        workletUrl: config.workletUrl,
        sampleRate: config.sampleRate,
      });
      this.fastRingReader = createFastRingReader(this.host.fastRing);
    }
    this.transition('initializing');
    const ready = this.once('ready');
    const host = this.host;
    host.postToWorklet({
      kind: 'init',
      sampleRate: config.sampleRate,
      blockSize: config.blockSize,
      bundledPublicKey: config.bundledPublicKey,
    });
    this.unsubscribeInbound = host.onInbound((msg) => this.handleInbound(msg));
    await ready;
    this.transition('idle');
  }

  /**
   * Start playback. `idle → ramping → playing`. Uses the ramp-up
   * duration from the engine config (default 3 s per ADR-015). In
   * test hosts that don't actually play audio, `ramping → playing`
   * still fires via setTimeout so the observable state sequence
   * matches the real path.
   */
  async play(): Promise<void> {
    await this.requireHost().resume();
    if (this.state === 'idle' || this.state === 'panicked' || this.state === 'errored') {
      this.transition('ramping');
      // Drive the ramp → playing transition locally; the audio
      // graph's ramp envelope runs in parallel on the worklet.
      const rampMs = this.rampMs;
      const promise = new Promise<void>((resolve) => {
        this.rampTimer = setTimeout(() => {
          if (this.state === 'ramping') this.transition('playing');
          resolve();
        }, rampMs);
      });
      await promise;
    }
  }

  async pause(): Promise<void> {
    if (this.rampTimer !== null) {
      clearTimeout(this.rampTimer);
      this.rampTimer = null;
    }
    await this.requireHost().suspend();
    if (this.state === 'playing' || this.state === 'ramping') {
      this.transition('idle');
    }
  }

  /**
   * Post a single-step roadmap (legacy entry point used by the M1
   * demo scaffold). Resolves on the next `StepStarted` event.
   */
  async loadRoadmapStep(stepJson: string): Promise<void> {
    const started = this.once('StepStarted');
    this.requireHost().postToWorklet({ kind: 'playStep', stepJson });
    await started;
  }

  /**
   * Load a multi-step roadmap. `roadmap` is either a JSON string or
   * the parsed object; the object form is stringified here so the
   * wire format stays consistent.
   */
  async loadRoadmap(
    roadmap: string | Record<string, unknown>,
  ): Promise<void> {
    const parsed = typeof roadmap === 'string' ? JSON.parse(roadmap) : roadmap;
    // FS-ISS-008: zod-validate before shipping the roadmap to the
    // worklet so a malformed roadmap fails with a clear error on the
    // main thread instead of silently misbehaving in the audio
    // callback. Roadmap is a subset of the pack Manifest schema.
    const validation = RoadmapZod.safeParse({
      pack_id: 'inline-roadmap',
      version: '0',
      min_app_version: '0.0.0',
      tier_required: 'free',
      files: [],
      roadmaps: [parsed],
    });
    if (!validation.success) {
      throw new Error(`AudioEngine.loadRoadmap: invalid roadmap — ${validation.error.message}`);
    }
    const started = this.once('StepStarted');
    this.requireHost().postToWorklet({ kind: 'loadRoadmap', roadmapJson: JSON.stringify(parsed) });
    await started;
  }

  /** Most recent playhead reading (seconds), sourced from the fast-
   *  ring `playhead` record stream. */
  readPlayhead(): number {
    // Poll any pending records and cache the most-recent sample count.
    this.drainFastRing();
    return this.samples / this.sampleRate;
  }

  /** Most recent post-limiter peak in dBFS; silence is reported as
   *  `-120.0` so UIs don't render `-Infinity`. */
  readLevelDb(): number {
    this.drainFastRing();
    return this.levelDb;
  }

  private drainFastRing(): void {
    if (!this.fastRingReader) return;
    for (const ev of this.fastRingReader.poll()) {
      if (ev.kind === 'playhead') {
        this.samples = ev.samples;
      } else if (ev.kind === 'levelDb') {
        this.levelDb = ev.dbfsTimes100 / 100;
      }
    }
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
    this.requireHost().postToWorklet({
      kind: 'setParam',
      nodeId: spec.nodeId,
      paramId: spec.paramId,
      value,
      smoothingMs,
    });
  }

  /** Panic-stop; `(any) → fading → panicked`. Idempotent. */
  async panicStop(): Promise<void> {
    if (this.state === 'fading' || this.state === 'panicked') {
      return;
    }
    if (this.rampTimer !== null) {
      clearTimeout(this.rampTimer);
      this.rampTimer = null;
    }
    this.transition('fading');
    const done = this.once('PanicFadeComplete');
    this.requireHost().postToWorklet({ kind: 'panicStop' });
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
    return this.fastRingReader?.poll() ?? [];
  }

  droppedFastRingEvents(): number {
    return this.fastRingReader?.droppedEvents() ?? 0;
  }

  async close(): Promise<void> {
    this.requireHost().postToWorklet({ kind: 'close' });
    await this.requireHost().close();
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
          const u = this.requireHost().onInbound((msg) => {
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
