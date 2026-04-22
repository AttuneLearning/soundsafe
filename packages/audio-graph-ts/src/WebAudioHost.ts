// Concrete browser-facing `AudioEngineHost`. Creates a real
// `AudioContext`, registers the worklet module, spins up an
// `AudioWorkletNode`, and bridges its `port` + a shared SAB
// fast-ring into the `AudioEngine` surface.
//
// Consumed by the consumer-app default factory. Tests still use
// `InMemoryHost` for deterministic state machines.

import type { AudioEngineHost, Unsubscribe } from './AudioEngine.js';
import type { InboundMessage, OutboundMessage } from './messages.js';
import { createFastRingSab } from './fast-ring.js';

export interface WebAudioHostConfig {
  /** URL of the compiled AudioWorklet processor module (an
   * ES module built from `src/worklet/processor.ts`). */
  workletUrl: string;
  /** Name registered via `registerProcessor` in the worklet
   * module. Defaults to the FS-ISS-008 constant. */
  processorName?: string;
  /** Requested sample rate. Browsers may override. */
  sampleRate?: number;
  /** Optional pre-constructed `AudioContext` (tests / host
   * embedding). */
  audioContext?: AudioContext;
}

export class WebAudioHost implements AudioEngineHost {
  readonly fastRing: SharedArrayBuffer;
  private readonly context: AudioContext;
  private node: AudioWorkletNode | null = null;
  private readonly inboundSubs = new Set<(m: InboundMessage) => void>();
  private readonly ready: Promise<void>;

  constructor(config: WebAudioHostConfig) {
    this.fastRing = createFastRingSab();
    this.context =
      config.audioContext ??
      new AudioContext(
        config.sampleRate !== undefined ? { sampleRate: config.sampleRate } : {},
      );
    const processorName = config.processorName ?? 'soundsafe-processor';
    this.ready = this.context.audioWorklet.addModule(config.workletUrl).then(() => {
      const node = new AudioWorkletNode(this.context, processorName, {
        processorOptions: { fastRingSab: this.fastRing },
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.port.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as InboundMessage;
        for (const cb of this.inboundSubs) cb(msg);
      };
      node.connect(this.context.destination);
      this.node = node;
    });
  }

  async resume(): Promise<void> {
    await this.ready;
    await this.context.resume();
  }

  async suspend(): Promise<void> {
    await this.ready;
    await this.context.suspend();
  }

  async close(): Promise<void> {
    await this.ready.catch(() => {});
    this.node?.disconnect();
    await this.context.close();
  }

  postToWorklet(msg: OutboundMessage): void {
    // Queue the message if the worklet is still booting.
    void this.ready.then(() => this.node?.port.postMessage(msg));
  }

  onInbound(cb: (msg: InboundMessage) => void): Unsubscribe {
    this.inboundSubs.add(cb);
    return () => this.inboundSubs.delete(cb);
  }
}

/**
 * Small feature-detect: returns `true` if the environment supports
 * `AudioContext` + `AudioWorkletNode` + `SharedArrayBuffer`. The
 * consumer-app default factory uses this to pick between
 * `WebAudioHost` and `InMemoryHost`.
 */
export function isWebAudioAvailable(): boolean {
  const g = globalThis as unknown as {
    AudioContext?: unknown;
    AudioWorkletNode?: unknown;
    SharedArrayBuffer?: unknown;
    crossOriginIsolated?: boolean;
  };
  return (
    typeof g.AudioContext !== 'undefined' &&
    typeof g.AudioWorkletNode !== 'undefined' &&
    typeof g.SharedArrayBuffer !== 'undefined' &&
    g.crossOriginIsolated !== false
  );
}
