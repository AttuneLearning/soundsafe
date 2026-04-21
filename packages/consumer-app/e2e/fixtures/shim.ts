// Playwright init script that swaps out Web Audio + SAB with a
// deterministic shim. Loaded via `page.addInitScript` so it runs
// before the app's JS.
//
// The shim DOES NOT play audio — it satisfies the `AudioContext`
// interface shape that `audio-graph-ts` uses, and drives the
// worklet's `process()` on a timer so `engine.state` transitions
// fire without requiring a real audio device.
//
// For M1 the focus is state-machine coverage. M2 swaps in a sample
// sink when golden-file signature transforms need bit-accurate
// verification.

export const SHIM_SCRIPT = `
(() => {
  if ((globalThis as any).__soundsafeShimInstalled) return;
  (globalThis as any).__soundsafeShimInstalled = true;

  const noopBuffer = { length: 0 };

  class FakeAudioParam {
    value = 0;
    setValueAtTime(v: number) { this.value = v; return this; }
    linearRampToValueAtTime(v: number) { this.value = v; return this; }
  }

  class FakeAudioNode {
    connect() { return this; }
    disconnect() { return this; }
  }

  class FakeAudioContext extends FakeAudioNode {
    state: 'suspended' | 'running' | 'closed' = 'suspended';
    sampleRate = 48000;
    currentTime = 0;
    destination = new FakeAudioNode();
    audioWorklet = {
      async addModule(_: string) { /* noop */ },
    };
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    createGain() { return Object.assign(new FakeAudioNode(), { gain: new FakeAudioParam() }); }
  }

  class FakeAudioWorkletNode extends FakeAudioNode {
    port = {
      onmessage: null as ((ev: MessageEvent) => void) | null,
      postMessage(msg: unknown) {
        // Simulate worklet ack for 'init'.
        if (typeof msg === 'object' && msg !== null && (msg as any).kind === 'init') {
          queueMicrotask(() => {
            this.onmessage?.({ data: { kind: 'ready' } } as MessageEvent);
          });
        }
      },
    };
    constructor(_ctx: unknown, _name: string) {
      super();
    }
  }

  (globalThis as any).AudioContext = FakeAudioContext;
  (globalThis as any).webkitAudioContext = FakeAudioContext;
  (globalThis as any).AudioWorkletNode = FakeAudioWorkletNode;

  if (typeof (globalThis as any).SharedArrayBuffer === 'undefined') {
    (globalThis as any).SharedArrayBuffer = ArrayBuffer;
  }
})();
`;
