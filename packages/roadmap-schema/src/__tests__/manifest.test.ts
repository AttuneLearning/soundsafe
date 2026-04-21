import { describe, it, expect } from 'vitest';
import { Manifest, PackFile, TierRequired } from '../generated.ts';

describe('Manifest schema', () => {
  it('parses a minimal valid manifest', () => {
    const input = {
      pack_id: 'starter',
      version: '2026-04-20.1',
      min_app_version: '0.1.0',
      tier_required: 'free',
      files: [
        {
          path: 'audio/01-dog-bark.opus.enc',
          nonce: 'AAAAAAAAAAAAAAAA',
          tag: 'BBBBBBBBBBBBBBBBBBBBBB==',
          sha256: 'Y29udGVudC1zaGEyNTYtcGxhY2Vob2xkZXItYmFzZTY0',
          duration_ms: 4500,
          label: 'Dog bark — baseline',
        },
      ],
    };
    const m = Manifest.parse(input);
    expect(m.pack_id).toBe('starter');
    expect(m.tier_required).toBe('free');
    expect(m.files).toHaveLength(1);
    expect(m.roadmaps).toEqual([]);
    expect(m.content_warnings).toEqual([]);
    expect(m.therapist).toBeUndefined();
  });

  it('preserves the reserved `therapist` field (ADR-004 round-trip)', () => {
    const input = {
      pack_id: 'future-pack',
      version: '1.0',
      min_app_version: '0.1.0',
      tier_required: 'interactive',
      files: [],
      therapist: { assignment_class: 'test', extra: [1, 2, 3] },
    };
    const m = Manifest.parse(input);
    expect(m.therapist).toBeDefined();
    expect((m.therapist as { assignment_class: string }).assignment_class).toBe(
      'test',
    );
  });

  it('rejects an unknown tier value', () => {
    const input = {
      pack_id: 'x',
      version: '1.0',
      min_app_version: '0.1.0',
      tier_required: 'unknown-tier',
      files: [],
    };
    expect(() => Manifest.parse(input)).toThrow();
  });
});

describe('PackFile schema', () => {
  it('rejects negative durations', () => {
    expect(() =>
      PackFile.parse({
        path: 'x',
        nonce: 'a',
        tag: 'b',
        sha256: 'c',
        duration_ms: -1,
        label: 'l',
      }),
    ).toThrow();
  });
});

describe('TierRequired enum', () => {
  it('accepts the three known tiers', () => {
    expect(TierRequired.parse('free')).toBe('free');
    expect(TierRequired.parse('relaxation')).toBe('relaxation');
    expect(TierRequired.parse('interactive')).toBe('interactive');
  });
});
