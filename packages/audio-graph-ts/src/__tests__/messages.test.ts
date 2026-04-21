import { describe, it, expect } from 'vitest';
import { parseEventsJson } from '../messages.js';

describe('messages.parseEventsJson', () => {
  it('parses an empty array', () => {
    expect(parseEventsJson('[]')).toEqual([]);
  });

  it('parses a full event set', () => {
    const json = JSON.stringify([
      { kind: 'StepStarted', index: 0 },
      { kind: 'StepCompleted', index: 0 },
      { kind: 'RoadmapCompleted' },
      { kind: 'PanicStopRequested' },
      { kind: 'PanicFadeComplete' },
      { kind: 'SafetyBlocked', reason: 'DisclaimerNotAcknowledged' },
    ]);
    const events = parseEventsJson(json);
    expect(events).toHaveLength(6);
    expect(events[0]).toEqual({ kind: 'StepStarted', index: 0 });
    expect(events[5]).toEqual({ kind: 'SafetyBlocked', reason: 'DisclaimerNotAcknowledged' });
  });

  it('drops objects with unknown kinds', () => {
    const json = JSON.stringify([
      { kind: 'StepStarted', index: 0 },
      { kind: 'NotAKind', foo: 1 },
    ]);
    const events = parseEventsJson(json);
    expect(events).toHaveLength(1);
  });

  it('throws on a non-array root', () => {
    expect(() => parseEventsJson('{"kind":"StepStarted","index":0}')).toThrow();
  });

  it('returns an empty array for an empty string', () => {
    expect(parseEventsJson('')).toEqual([]);
  });
});
