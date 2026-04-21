import { describe, it, expect } from 'vitest';
import {
  RECORD_COUNT,
  createFastRingReader,
  createFastRingSab,
  createFastRingWriter,
  KIND_PLAYHEAD,
  KIND_LEVEL_DB,
  KIND_LIMITER_HIT,
  KIND_RAMP_DONE,
} from '../fast-ring.js';

describe('fast-ring', () => {
  it('round-trips a playhead record', () => {
    const sab = createFastRingSab();
    const w = createFastRingWriter(sab);
    const r = createFastRingReader(sab);
    expect(w.push(KIND_PLAYHEAD, 12_345, 0, 500)).toBe(true);
    const events = r.poll();
    expect(events).toEqual([{ kind: 'playhead', samples: 12_345, ts: 500 }]);
  });

  it('round-trips a levelDb record (signed int)', () => {
    const sab = createFastRingSab();
    const w = createFastRingWriter(sab);
    const r = createFastRingReader(sab);
    // -3.5 dBFS → -350 scaled. As u32 the bit pattern is (0 - 350).
    const scaled = -350;
    w.push(KIND_LEVEL_DB, scaled >>> 0, 0, 123);
    const events = r.poll();
    expect(events).toEqual([{ kind: 'levelDb', dbfsTimes100: -350, ts: 123 }]);
  });

  it('decodes rampDone and limiterHit', () => {
    const sab = createFastRingSab();
    const w = createFastRingWriter(sab);
    const r = createFastRingReader(sab);
    w.push(KIND_RAMP_DONE, 0, 0, 1000);
    w.push(KIND_LIMITER_HIT, 98, 0, 1100);
    const events = r.poll();
    expect(events).toEqual([
      { kind: 'rampDone', ts: 1000 },
      { kind: 'limiterHit', peakTimes100: 98, ts: 1100 },
    ]);
  });

  it('decodes unknown kinds without throwing', () => {
    const sab = createFastRingSab();
    const w = createFastRingWriter(sab);
    const r = createFastRingReader(sab);
    w.push(9999, 1, 2, 3);
    const events = r.poll();
    expect(events).toEqual([{ kind: 'unknown', tag: 9999, a: 1, b: 2, ts: 3 }]);
  });

  it('preserves ordering for multiple pushes', () => {
    const sab = createFastRingSab();
    const w = createFastRingWriter(sab);
    const r = createFastRingReader(sab);
    for (let i = 0; i < 5; i++) w.push(KIND_PLAYHEAD, i * 100, 0, i);
    const events = r.poll();
    expect(events.map((e) => ('samples' in e ? e.samples : -1))).toEqual([0, 100, 200, 300, 400]);
  });

  it('increments dropped count when writer laps reader', () => {
    const sab = createFastRingSab();
    const w = createFastRingWriter(sab);
    const r = createFastRingReader(sab);
    // Fill the ring (capacity is RECORD_COUNT - 1 under the "next === reader means full" invariant).
    for (let i = 0; i < RECORD_COUNT - 1; i++) w.push(KIND_PLAYHEAD, i, 0, i);
    expect(r.droppedEvents()).toBe(0);
    expect(w.push(KIND_PLAYHEAD, 999, 0, 999)).toBe(false);
    expect(r.droppedEvents()).toBe(1);
    // Drain one then push — succeeds.
    r.poll();
    expect(w.push(KIND_PLAYHEAD, 1000, 0, 1000)).toBe(true);
  });
});
