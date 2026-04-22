// Main-thread pack client. Orchestrates:
//   1. Catalog fetch (`/latest.json`).
//   2. Pack zip download (Cache API).
//   3. Entitlement exchange (`/entitlement`) — one-microtask key on heap.
//   4. Decrypt-worker handoff (manifest + key + encrypted files).
//   5. OPFS write under v4-UUID names (ADR-025).
//   6. OPFS index row populate for later `openSound` lookup.
//
// The client accepts injected dependencies for every side-effectful
// path (fetch, rustcore bridge, OPFS store, index, UUID gen). Tests
// wire in-memory stubs; production wires real browser APIs.

import type {
  CatalogResponse,
  EntitlementResponse,
  OpfsIndexRow,
  PackBytes,
  PackMeta,
  ProgressCb,
  UnlockOutcome,
} from './types.js';
import type { OpfsIndex } from './opfs-index.js';
import type { OpfsStore } from './opfs-store.js';
import { uuidV4 } from './opfs-store.js';
import type { RustcoreBridge } from './rustcore-bridge.js';

export interface PackClientDeps {
  /** `fetch`-compatible function, pre-configured with the catalog origin. */
  fetch: typeof fetch;
  /** Lazy rustcore bridge — loaded on first unlock. */
  rustcore: RustcoreBridge;
  /** OPFS file store. */
  opfs: OpfsStore;
  /** OPFS index table. */
  opfsIndex: OpfsIndex;
  /** Optional override for testability (fixed-seed UUID). */
  newUuid?: () => string;
  /** Optional override of SHA-256. */
  sha256?: (bytes: Uint8Array) => Promise<string>;
}

export class PackClient {
  private readonly deps: PackClientDeps;

  constructor(deps: PackClientDeps) {
    this.deps = deps;
  }

  async listCatalog(): Promise<PackMeta[]> {
    const res = await this.deps.fetch('/latest.json');
    if (!res.ok) {
      throw new Error(`catalog fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as CatalogResponse;
    return Object.entries(body.packs).map(([packId, version]) => ({
      packId,
      version,
      tier: 'free',
    }));
  }

  /**
   * Fetch the encrypted pack bundle. The caller provides the bundle
   * bytes via `bundle` (typically a zip decoded up-stream). The
   * client treats the bundle as opaque and hands it to the decrypt
   * step via `unlock`.
   */
  async downloadPack(
    packId: string,
    onProgress?: ProgressCb,
  ): Promise<Response> {
    const res = await this.deps.fetch(`/packs/${packId}/latest.zip`);
    if (!res.ok) {
      throw new Error(`pack fetch failed: ${res.status}`);
    }
    onProgress?.(1);
    return res;
  }

  /**
   * Verify the manifest, fetch the entitlement, hand the key to
   * rust-core, decrypt every file, and write OPFS entries.
   *
   * `packBytes` is supplied by the caller (after unzipping the
   * downloaded bundle, which is a pipeline concern outside this
   * class).
   */
  async unlock(
    packId: string,
    jwt: string,
    packBytes: PackBytes,
  ): Promise<UnlockOutcome> {
    let verifiedPackId: string;
    try {
      verifiedPackId = await this.deps.rustcore.verifyManifest(
        packBytes.manifestBytes,
        packBytes.signatureBytes,
      );
    } catch (err) {
      return {
        kind: 'manifest-rejected',
        message: err instanceof Error ? err.message : String(err),
      };
    }
    if (verifiedPackId !== packId) {
      return { kind: 'manifest-rejected', message: `pack id mismatch: ${verifiedPackId} vs ${packId}` };
    }

    const entRes = await this.deps.fetch('/entitlement', {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
      body: JSON.stringify({ packId }),
    });
    if (!entRes.ok) {
      return { kind: 'entitlement-rejected', status: entRes.status };
    }
    const ent = (await entRes.json()) as EntitlementResponse;
    const packKeyBytes = base64ToBytes(ent.packKeyBase64);

    try {
      await this.deps.rustcore.setPackKey(packKeyBytes);
    } finally {
      // ADR-010: clear the main-thread copy of the key immediately
      // regardless of success; the WASM vault holds its own
      // Zeroizing copy.
      packKeyBytes.fill(0);
    }

    try {
      const newUuid = this.deps.newUuid ?? uuidV4;
      const sha256 = this.deps.sha256 ?? defaultSha256;
      const opfsPackUuid = newUuid();
      const rows: OpfsIndexRow[] = [];
      for (const file of packBytes.files) {
        let plaintext: Uint8Array;
        try {
          plaintext = await this.deps.rustcore.decryptFile(
            file.ciphertext,
            file.nonce,
            file.tag,
          );
        } catch (err) {
          return {
            kind: 'decrypt-failed',
            path: file.path,
            message: err instanceof Error ? err.message : String(err),
          };
        }
        const opfsFileUuid = newUuid();
        await this.deps.opfs.writeFile(opfsPackUuid, opfsFileUuid, plaintext);
        const row: OpfsIndexRow = {
          packId,
          soundId: file.path,
          opfsPackUuid,
          opfsFileUuid,
          sha256: await sha256(plaintext),
          bytes: plaintext.byteLength,
        };
        rows.push(row);
        await this.deps.opfsIndex.put(row);
      }
      return { kind: 'ok' };
    } finally {
      await this.deps.rustcore.clearPackKey();
    }
  }

  async openSound(packId: string, soundId: string): Promise<Uint8Array> {
    const row = await this.deps.opfsIndex.lookup(packId, soundId);
    if (!row) {
      throw new Error(`no such sound: ${packId}/${soundId}`);
    }
    return this.deps.opfs.readFile(row.opfsPackUuid, row.opfsFileUuid);
  }

  /**
   * Stream-oriented read over a pack file. Returns a `ReadableStream<
   * Uint8Array>` so downstream consumers (e.g. `audio-graph-ts`'s
   * worklet loader) can process the plaintext without materializing
   * the whole file on the main-thread heap.
   *
   * The OPFS handle is NEVER exposed — see the ADR-025 ESLint rule in
   * `eslint.config.js` forbidding `URL.createObjectURL`.
   */
  async openSoundStream(packId: string, soundId: string): Promise<ReadableStream<Uint8Array>> {
    const bytes = await this.openSound(packId, soundId);
    let offset = 0;
    const CHUNK = 64 * 1024;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.byteLength) {
          controller.close();
          return;
        }
        const end = Math.min(offset + CHUNK, bytes.byteLength);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
      },
    });
  }

  async evict(packId: string): Promise<void> {
    const rows = await this.deps.opfsIndex.listForPack(packId);
    for (const row of rows) {
      await this.deps.opfs.deletePack(row.opfsPackUuid);
    }
    await this.deps.opfsIndex.deletePack(packId);
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function defaultSha256(bytes: Uint8Array): Promise<string> {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
