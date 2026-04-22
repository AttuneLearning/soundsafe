// Message protocol between the main thread and the AudioWorklet.
//
// Shape: every message is `{ kind: string, ...payload }`. The worklet
// message handler is a `switch (msg.kind)` and delegates to the
// rust-core wasm-bindgen entry points (`setParam`, `playStep`,
// `panicStop`, etc.).
//
// Kept small on purpose: anything audio-accurate goes through the
// SAB fast ring (see `fast-ring.ts`). `port.postMessage` is reserved
// for things the main thread can handle on a `requestAnimationFrame`
// cadence — roadmap events, log lines, one-shot acknowledgements.

export type OutboundMessage =
  | { kind: 'init'; sampleRate: number; blockSize: number; bundledPublicKey: Uint8Array }
  | { kind: 'setParam'; nodeId: number; paramId: number; value: number; smoothingMs: number }
  | { kind: 'playStep'; stepJson: string }
  | { kind: 'loadRoadmap'; roadmapJson: string }
  | { kind: 'panicStop' }
  | { kind: 'pollEvents' }
  | { kind: 'close' };

export type InboundMessage =
  | { kind: 'ready' }
  | { kind: 'events'; events: ReadonlyArray<AudioEvent> }
  | { kind: 'error'; message: string };

export type AudioEvent =
  | { kind: 'StepStarted'; index: number }
  | { kind: 'StepCompleted'; index: number }
  | { kind: 'RoadmapCompleted' }
  | { kind: 'PanicStopRequested' }
  | { kind: 'PanicFadeComplete' }
  | { kind: 'SafetyBlocked'; reason: string };

export type AudioEventKind = AudioEvent['kind'];

export type AudioEventPayload = {
  [K in AudioEventKind]: Extract<AudioEvent, { kind: K }>;
};

export function parseEventsJson(json: string): AudioEvent[] {
  if (!json) return [];
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error(`expected events array, got ${typeof parsed}`);
  }
  return parsed.filter(isAudioEvent);
}

function isAudioEvent(x: unknown): x is AudioEvent {
  if (typeof x !== 'object' || x === null) return false;
  const kind = (x as { kind?: unknown }).kind;
  return (
    kind === 'StepStarted' ||
    kind === 'StepCompleted' ||
    kind === 'RoadmapCompleted' ||
    kind === 'PanicStopRequested' ||
    kind === 'PanicFadeComplete' ||
    kind === 'SafetyBlocked'
  );
}
