// Main-thread pack client. Orchestrates:
//   1. Catalog fetch (`/latest.json`).
//   2. Pack bundle download (Cache API).
//   3. Entitlement exchange (`/entitlement`) — one-microtask key on heap.
//   4. Decrypt via rustcore bridge (worker in production).
//   5. OPFS write under v4-UUID names (ADR-025).
//   6. OPFS index row populate for later `openSound` lookup.
//
// Public surface matches the FS-ISS-009 spec:
//   - listCatalog(): Promise<PackMeta[]>
//   - download(packId, onProgress?): Promise<PackBytes>
//   - unlock(packId, jwt): Promise<UnlockOutcome>
//   - openSound(packId, soundId): Promise<ReadableStream<Uint8Array>>
//   - evict(packId): Promise<void>
//
// Internal `unlockWithBytes` preserves the inject-bytes path for
// offline tests + the consumer-app demo flow.

import type {
  CatalogResponse,
  EncryptedFileBytes,
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
  fetch: typeof fetch;
  rustcore: RustcoreBridge;
  opfs: OpfsStore;
  opfsIndex: OpfsIndex;
  newUuid?: () => string;
  sha256?: (bytes: Uint8Array) => Promise<string>;
}

/**
 * On-wire shape of `GET /packs/:packId/:version.zip` (JSON-encoded for
 * M1; M2 switches to a real zip once we have an unzipper in-tree).
 */
interface PackBundleEnvelope {
  pack_id: string;
  manifest_bytes_b64: string;
  signature_bytes_b64: string;
  files: Array<{
    path: string;
    ciphertext_b64: string;
    nonce_b64: string;
    tag_b64: string;
  }>;
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
   * Fetch the encrypted pack bundle and return it as parsed
   * `PackBytes` so `unlock` (or tests) can hand it to the decrypt
   * pipeline directly.
   */
  async download(packId: string, onProgress?: ProgressCb): Promise<PackBytes> {
    const res = await this.deps.fetch(`/packs/${packId}/latest.zip`);
    if (!res.ok) {
      throw new Error(`pack fetch failed: ${res.status}`);
    }
    onProgress?.(0.5);
    const envelope = (await res.json()) as PackBundleEnvelope;
    const files: EncryptedFileBytes[] = envelope.files.map((f) => ({
      path: f.path,
      ciphertext: base64ToBytes(f.ciphertext_b64),
      nonce: base64ToBytes(f.nonce_b64),
      tag: base64ToBytes(f.tag_b64),
    }));
    onProgress?.(1);
    return {
      packId: envelope.pack_id,
      manifestBytes: base64ToBytes(envelope.manifest_bytes_b64),
      signatureBytes: base64ToBytes(envelope.signature_bytes_b64),
      files,
    };
  }

  /**
   * 2-arg unlock per FS-ISS-009 spec: fetch the bundle, exchange the
   * JWT for the pack key, decrypt, OPFS-write. Internally delegates
   * to `unlockWithBytes` once the download completes.
   */
  async unlock(packId: string, jwt: string): Promise<UnlockOutcome> {
    let packBytes: PackBytes;
    try {
      packBytes = await this.download(packId);
    } catch (err) {
      return {
        kind: 'manifest-rejected',
        message: err instanceof Error ? err.message : String(err),
      };
    }
    return this.unlockWithBytes(packId, jwt, packBytes);
  }

  /**
   * Used by tests + the consumer-app demo to feed pre-downloaded
   * bytes straight into the decrypt pipeline. Kept on the public
   * surface so the 2-arg `unlock` is implementable as
   * `download` + `unlockWithBytes`.
   */
  async unlockWithBytes(
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
      return {
        kind: 'manifest-rejected',
        message: `pack id mismatch: ${verifiedPackId} vs ${packId}`,
      };
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
      packKeyBytes.fill(0);
    }

    try {
      const newUuid = this.deps.newUuid ?? uuidV4;
      const sha256 = this.deps.sha256 ?? defaultSha256;
      const opfsPackUuid = newUuid();
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
        await this.deps.opfsIndex.put(row);
      }
      return { kind: 'ok' };
    } finally {
      await this.deps.rustcore.clearPackKey();
    }
  }

  /**
   * Stream-oriented sound reader. Returns a `ReadableStream<Uint8Array>`
   * so the caller (audio-graph-ts worklet loader) can consume
   * plaintext without materializing the whole file on the main-thread
   * heap. ADR-025: the OPFS handle itself is never exposed.
   */
  async openSound(packId: string, soundId: string): Promise<ReadableStream<Uint8Array>> {
    const bytes = await this.openSoundBytes(packId, soundId);
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

  /**
   * Bytes accessor for consumers that don't want a stream (tests,
   * bulk verification paths). Not part of the FS-ISS-009 public
   * contract.
   */
  async openSoundBytes(packId: string, soundId: string): Promise<Uint8Array> {
    const row = await this.deps.opfsIndex.lookup(packId, soundId);
    if (!row) {
      throw new Error(`no such sound: ${packId}/${soundId}`);
    }
    return this.deps.opfs.readFile(row.opfsPackUuid, row.opfsFileUuid);
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
