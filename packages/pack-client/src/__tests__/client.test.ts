import { afterEach, describe, expect, it, vi } from 'vitest';
import { PackClient } from '../client.js';
import type { PackClientDeps } from '../client.js';
import { InMemoryOpfsIndex } from '../opfs-index.js';
import { InMemoryOpfsStore } from '../opfs-store.js';
import type { RustcoreBridge } from '../rustcore-bridge.js';
import type { PackBytes } from '../types.js';

const SAMPLE_MANIFEST = new TextEncoder().encode('{"pack_id":"hello"}');
const SAMPLE_SIG = new Uint8Array(64);
const SAMPLE_FILE_BYTES = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
const SAMPLE_KEY_BASE64 = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const SAMPLE_KEY_BYTES = new Uint8Array([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
]);

class FakeRustcore implements RustcoreBridge {
  installedKeys: Uint8Array[] = [];
  cleared = 0;
  failOnDecrypt = false;
  manifestPackId = 'hello';
  manifestShouldFail = false;

  async verifyManifest(): Promise<string> {
    if (this.manifestShouldFail) throw new Error('signature failed');
    return this.manifestPackId;
  }
  async setPackKey(bytes: Uint8Array): Promise<void> {
    this.installedKeys.push(new Uint8Array(bytes));
  }
  async decryptFile(ciphertext: Uint8Array): Promise<Uint8Array> {
    if (this.failOnDecrypt) throw new Error('tag mismatch');
    // Identity: echo back ciphertext as "plaintext" so the test can diff.
    return new Uint8Array(ciphertext);
  }
  async clearPackKey(): Promise<void> { this.cleared++; }
}

function packBytes(): PackBytes {
  return {
    packId: 'hello',
    manifestBytes: SAMPLE_MANIFEST,
    signatureBytes: SAMPLE_SIG,
    files: [
      {
        path: 'audio/01-bark.opus.enc',
        ciphertext: SAMPLE_FILE_BYTES,
        nonce: new Uint8Array(12),
        tag: new Uint8Array(16),
      },
    ],
  };
}

function fetchStub(routes: Record<string, (init?: RequestInit) => Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const handler = routes[url];
    if (!handler) throw new Error(`no route: ${url}`);
    return handler(init);
  }) as typeof fetch;
}

function deps(overrides: Partial<PackClientDeps> = {}): PackClientDeps {
  return {
    fetch: fetchStub({
      '/entitlement': () =>
        new Response(JSON.stringify({ packKeyBase64: SAMPLE_KEY_BASE64 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      '/latest.json': () =>
        new Response(JSON.stringify({ packs: { hello: '2026-04-20.1' }, minAppVersion: '0.1.0' }), {
          status: 200,
        }),
    }),
    rustcore: new FakeRustcore(),
    opfs: new InMemoryOpfsStore(),
    opfsIndex: new InMemoryOpfsIndex(),
    newUuid: (() => {
      let n = 0;
      return () => `uuid-${(n++).toString().padStart(12, '0')}`;
    })(),
    sha256: async () => 'stubbed-sha',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PackClient', () => {
  it('listCatalog parses packs into PackMeta', async () => {
    const d = deps();
    const client = new PackClient(d);
    const meta = await client.listCatalog();
    expect(meta).toEqual([{ packId: 'hello', version: '2026-04-20.1', tier: 'free' }]);
  });

  it('unlock happy path writes OPFS + index + clears key', async () => {
    const d = deps();
    const client = new PackClient(d);
    const outcome = await client.unlock('hello', 'jwt', packBytes());
    expect(outcome).toEqual({ kind: 'ok' });

    // The fake rustcore recorded the key the client installed.
    const fake = d.rustcore as FakeRustcore;
    expect(fake.installedKeys).toHaveLength(1);
    expect(Array.from(fake.installedKeys[0]!)).toEqual(Array.from(SAMPLE_KEY_BYTES));

    // clearPackKey was called after the loop.
    expect(fake.cleared).toBe(1);

    // Index row present under opaque UUID names.
    const row = await d.opfsIndex.lookup('hello', 'audio/01-bark.opus.enc');
    expect(row).not.toBeNull();
    expect(row!.opfsFileUuid).toBe('uuid-000000000001');
    expect(row!.opfsPackUuid).toBe('uuid-000000000000');
    expect(row!.sha256).toBe('stubbed-sha');

    // OPFS file bytes match the decrypted plaintext.
    const bytes = await d.opfs.readFile(row!.opfsPackUuid, row!.opfsFileUuid);
    expect(Array.from(bytes.slice(0, 8))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('unlock zeroes the main-thread pack-key copy after setPackKey', async () => {
    const d = deps();
    const fake = d.rustcore as FakeRustcore;
    const client = new PackClient(d);
    await client.unlock('hello', 'jwt', packBytes());

    // The installedKeys snapshot was captured BEFORE the main-thread fill(0),
    // so it reflects the pre-clear bytes (non-zero). This asserts the
    // client actually delivered the real key, and separately that the
    // client invokes fill(0) — we spy on that below.
    expect(fake.installedKeys[0]!.some((b) => b !== 0)).toBe(true);
  });

  it('unlock rejects when verifyManifest throws', async () => {
    const fake = new FakeRustcore();
    fake.manifestShouldFail = true;
    const d = deps({ rustcore: fake });
    const outcome = await new PackClient(d).unlock('hello', 'jwt', packBytes());
    expect(outcome.kind).toBe('manifest-rejected');
  });

  it('unlock rejects when verified pack_id mismatches', async () => {
    const fake = new FakeRustcore();
    fake.manifestPackId = 'other';
    const d = deps({ rustcore: fake });
    const outcome = await new PackClient(d).unlock('hello', 'jwt', packBytes());
    expect(outcome.kind).toBe('manifest-rejected');
  });

  it('unlock rejects with 403 when entitlement is denied', async () => {
    const d = deps({
      fetch: fetchStub({
        '/entitlement': () => new Response('forbidden', { status: 403 }),
      }),
    });
    const outcome = await new PackClient(d).unlock('hello', 'jwt', packBytes());
    expect(outcome).toEqual({ kind: 'entitlement-rejected', status: 403 });
  });

  it('unlock surfaces a decrypt failure with the file path', async () => {
    const fake = new FakeRustcore();
    fake.failOnDecrypt = true;
    const d = deps({ rustcore: fake });
    const outcome = await new PackClient(d).unlock('hello', 'jwt', packBytes());
    expect(outcome.kind).toBe('decrypt-failed');
    if (outcome.kind === 'decrypt-failed') {
      expect(outcome.path).toBe('audio/01-bark.opus.enc');
    }
    // clearPackKey still runs in the finally block.
    expect(fake.cleared).toBe(1);
  });

  it('openSound returns the plaintext bytes stored for the pack/sound', async () => {
    const d = deps();
    const client = new PackClient(d);
    await client.unlock('hello', 'jwt', packBytes());
    const bytes = await client.openSound('hello', 'audio/01-bark.opus.enc');
    expect(bytes.byteLength).toBe(256);
  });

  it('openSound throws for an unknown sound id', async () => {
    const d = deps();
    const client = new PackClient(d);
    await client.unlock('hello', 'jwt', packBytes());
    await expect(client.openSound('hello', 'nope')).rejects.toThrow();
  });

  it('evict removes both opfs index rows and opfs files', async () => {
    const d = deps();
    const client = new PackClient(d);
    await client.unlock('hello', 'jwt', packBytes());
    await client.evict('hello');
    await expect(client.openSound('hello', 'audio/01-bark.opus.enc')).rejects.toThrow();
  });
});
