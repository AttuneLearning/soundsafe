// AudioWorkletProcessor skeleton that hosts the rust-core WASM
// instance.
//
// NOTE: this file is compiled and loaded via `audioContext.audioWorklet
// .addModule(...)`. It runs in the AudioWorklet global scope, which
// exposes `registerProcessor`, `currentTime`, `sampleRate` and a
// `class AudioWorkletProcessor`. The `Rustcore` import below must
// resolve to the wasm-pack `--target web` bundle; at build time we
// inline the WASM bytes (or inline the `.wasm` URL) so the worklet
// doesn't hit the network from inside the audio thread.
//
// This file is intentionally kept off the vitest test path — the
// real worklet is exercised by the Playwright E2E in M1.10.

/// <reference lib="webworker" />

import type { OutboundMessage, AudioEvent } from '../messages.js';
import {
  KIND_LEVEL_DB,
  KIND_PLAYHEAD,
  createFastRingWriter,
} from '../fast-ring.js';

declare const registerProcessor: (
  name: string,
  ctor: typeof SoundsafeProcessor,
) => void;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

type RustcoreModule = {
  default: (wasm: ArrayBuffer | Uint8Array) => Promise<unknown>;
  engineInit: (sampleRate: number, blockSize: number, bundledPublicKey: Uint8Array) => void;
  setParam: (nodeId: number, paramId: number, value: number, smoothingMs: number) => void;
  playStep: (json: string) => void;
  loadRoadmap: (json: string) => void;
  panicStop: () => void;
  pollEvents: () => string;
  processBlock: (input: Float32Array) => Float32Array;
  lastPeakDbfs: () => number;
};

declare const RUSTCORE_BYTES: Uint8Array;
declare const loadRustcore: () => Promise<RustcoreModule>;
declare const FAST_RING_SAB: SharedArrayBuffer;

class SoundsafeProcessor extends AudioWorkletProcessor {
  private rustcore: RustcoreModule | null = null;
  private initialized = false;
  private processedSamples = 0;
  private fastRingWriter: ReturnType<typeof createFastRingWriter> | null = null;

  constructor() {
    super();
    if (typeof FAST_RING_SAB !== 'undefined') {
      this.fastRingWriter = createFastRingWriter(FAST_RING_SAB);
    }
    this.port.onmessage = (ev: MessageEvent) => {
      void this.handleMessage(ev.data as OutboundMessage);
    };
  }

  private async handleMessage(msg: OutboundMessage): Promise<void> {
    try {
      switch (msg.kind) {
        case 'init': {
          const mod = await loadRustcore();
          await mod.default(RUSTCORE_BYTES);
          mod.engineInit(msg.sampleRate, msg.blockSize, msg.bundledPublicKey);
          this.rustcore = mod;
          this.initialized = true;
          this.port.postMessage({ kind: 'ready' });
          break;
        }
        case 'setParam':
          this.rustcore?.setParam(msg.nodeId, msg.paramId, msg.value, msg.smoothingMs);
          break;
        case 'playStep':
          this.rustcore?.playStep(msg.stepJson);
          break;
        case 'loadRoadmap':
          this.rustcore?.loadRoadmap(msg.roadmapJson);
          break;
        case 'panicStop':
          this.rustcore?.panicStop();
          break;
        case 'pollEvents':
          this.flushEvents();
          break;
        case 'close':
          this.rustcore = null;
          this.initialized = false;
          break;
      }
    } catch (err) {
      this.port.postMessage({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private flushEvents(): void {
    if (!this.rustcore) return;
    const json = this.rustcore.pollEvents();
    let events: AudioEvent[] = [];
    try {
      const parsed: unknown = JSON.parse(json);
      if (Array.isArray(parsed)) {
        events = parsed as AudioEvent[];
      }
    } catch {
      // intentionally swallowed — malformed JSON from WASM is a bug in
      // rust-core, not an audio-thread-actionable condition.
    }
    if (events.length > 0) {
      this.port.postMessage({ kind: 'events', events });
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    if (!this.initialized || !this.rustcore) {
      return true;
    }
    const inputChannel = inputs[0]?.[0];
    const outputChannel = outputs[0]?.[0];
    if (!inputChannel || !outputChannel) {
      return true;
    }
    const block = this.rustcore.processBlock(inputChannel);
    const n = Math.min(block.length, outputChannel.length);
    for (let i = 0; i < n; i++) {
      outputChannel[i] = block[i] ?? 0;
    }
    this.processedSamples += n;
    this.writeFastRing();
    this.flushEvents();
    return true;
  }

  private writeFastRing(): void {
    const w = this.fastRingWriter;
    if (!w || !this.rustcore) return;
    const tsSamples = this.processedSamples | 0;
    // Playhead: sample count split into low/high u32 halves.
    const low = this.processedSamples >>> 0;
    const high = Math.floor(this.processedSamples / 0x100000000) >>> 0;
    w.push(KIND_PLAYHEAD, low, high, tsSamples);
    // Level: dBFS × 100 as signed int, clamped to the u32 wire.
    const dbfs = this.rustcore.lastPeakDbfs();
    const scaled = Math.round(Math.max(-12000, Math.min(600, dbfs * 100)));
    w.push(KIND_LEVEL_DB, scaled >>> 0, 0, tsSamples);
  }
}

registerProcessor('soundsafe-processor', SoundsafeProcessor);
