// SAB-backed fast ring for audio-accurate events.
//
// Layout (all u32, little-endian):
//   [0]  writer_pos (mod RECORD_COUNT)
//   [1]  reader_pos (mod RECORD_COUNT)
//   [2]  dropped_events (saturating counter)
//   [3]  reserved
//   [4..] records × RECORD_SIZE_BYTES, laid out contiguously.
//
// Each record is 16 bytes: `{ kind_u32, a_u32, b_u32, ts_u32 }`.
// `kind_u32` is a numeric tag; see `KIND_*` constants below. `a` and
// `b` are payload slots (e.g. sample count low/high). `ts_u32` is the
// number of samples since engine start.
//
// Writer: the AudioWorkletProcessor. Single producer.
// Reader: the main thread, polled on `requestAnimationFrame`. Single
// consumer. Under SPSC the readback uses `Atomics.load` on
// `writer_pos` and `Atomics.store` on `reader_pos`; no locking
// needed.
//
// Overflow: if the writer laps the reader, the record is dropped and
// `dropped_events` is incremented. The reader surfaces the count so
// the UI can warn if audio-thread traffic is getting lost.

export const RECORD_SIZE_BYTES = 16;
export const RECORD_COUNT = 256;
export const HEADER_U32_COUNT = 4;
export const HEADER_BYTES = HEADER_U32_COUNT * 4;
export const TOTAL_BYTES = HEADER_BYTES + RECORD_COUNT * RECORD_SIZE_BYTES;

export const KIND_PLAYHEAD = 1;
export const KIND_LEVEL_DB = 2;
export const KIND_RAMP_DONE = 3;
export const KIND_LIMITER_HIT = 4;

export type FastRingEvent =
  | { kind: 'playhead'; samples: number; ts: number }
  | { kind: 'levelDb'; dbfsTimes100: number; ts: number }
  | { kind: 'rampDone'; ts: number }
  | { kind: 'limiterHit'; peakTimes100: number; ts: number }
  | { kind: 'unknown'; tag: number; a: number; b: number; ts: number };

export function createFastRingSab(): SharedArrayBuffer {
  return new SharedArrayBuffer(TOTAL_BYTES);
}

export function createFastRingWriter(sab: SharedArrayBuffer) {
  const header = new Uint32Array(sab, 0, HEADER_U32_COUNT);
  const records = new Uint32Array(sab, HEADER_BYTES, RECORD_COUNT * 4);

  const push = (kind: number, a: number, b: number, ts: number): boolean => {
    const writer = Atomics.load(header, 0);
    const reader = Atomics.load(header, 1);
    const next = (writer + 1) % RECORD_COUNT;
    if (next === reader) {
      const dropped = Atomics.load(header, 2);
      if (dropped < 0xffffffff) {
        Atomics.store(header, 2, dropped + 1);
      }
      return false;
    }
    const base = writer * 4;
    records[base] = kind | 0;
    records[base + 1] = a | 0;
    records[base + 2] = b | 0;
    records[base + 3] = ts | 0;
    Atomics.store(header, 0, next);
    return true;
  };

  return { push };
}

export function createFastRingReader(sab: SharedArrayBuffer) {
  const header = new Uint32Array(sab, 0, HEADER_U32_COUNT);
  const records = new Uint32Array(sab, HEADER_BYTES, RECORD_COUNT * 4);

  const poll = (): FastRingEvent[] => {
    const writer = Atomics.load(header, 0);
    let reader = Atomics.load(header, 1);
    const out: FastRingEvent[] = [];
    while (reader !== writer) {
      const base = reader * 4;
      const tag = records[base] ?? 0;
      const a = records[base + 1] ?? 0;
      const b = records[base + 2] ?? 0;
      const ts = records[base + 3] ?? 0;
      out.push(decode(tag, a, b, ts));
      reader = (reader + 1) % RECORD_COUNT;
    }
    Atomics.store(header, 1, reader);
    return out;
  };

  const droppedEvents = (): number => Atomics.load(header, 2);

  return { poll, droppedEvents };
}

function decode(tag: number, a: number, b: number, ts: number): FastRingEvent {
  switch (tag) {
    case KIND_PLAYHEAD:
      // a = low 32 bits of sample count, b = high 32 bits.
      return { kind: 'playhead', samples: (b * 0x100000000) + a, ts };
    case KIND_LEVEL_DB:
      // a encodes dbfs * 100 as i32.
      return { kind: 'levelDb', dbfsTimes100: toI32(a), ts };
    case KIND_RAMP_DONE:
      return { kind: 'rampDone', ts };
    case KIND_LIMITER_HIT:
      return { kind: 'limiterHit', peakTimes100: toI32(a), ts };
    default:
      return { kind: 'unknown', tag, a, b, ts };
  }
}

function toI32(u: number): number {
  return u | 0;
}
