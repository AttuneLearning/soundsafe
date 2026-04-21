// OPFS file store.
//
// Per ADR-025:
//   - Per-pack directory is a v4 UUID (no relation to pack id).
//   - Each file is a v4 UUID with NO extension.
//   - URL.createObjectURL must never see a handle from here — enforced
//     by a lint rule (landing as a follow-up in a later phase).
//
// In tests we swap in an in-memory store. In production we talk to
// `navigator.storage.getDirectory()` and write via
// `FileSystemFileHandle.createWritable()`.

export interface OpfsStore {
  writeFile(packUuid: string, fileUuid: string, bytes: Uint8Array): Promise<void>;
  readFile(packUuid: string, fileUuid: string): Promise<Uint8Array>;
  deletePack(packUuid: string): Promise<void>;
}

export class InMemoryOpfsStore implements OpfsStore {
  private readonly files = new Map<string, Uint8Array>();

  private key(packUuid: string, fileUuid: string): string {
    return `${packUuid}/${fileUuid}`;
  }

  async writeFile(packUuid: string, fileUuid: string, bytes: Uint8Array): Promise<void> {
    this.files.set(this.key(packUuid, fileUuid), new Uint8Array(bytes));
  }

  async readFile(packUuid: string, fileUuid: string): Promise<Uint8Array> {
    const found = this.files.get(this.key(packUuid, fileUuid));
    if (!found) throw new Error(`no such OPFS entry: ${packUuid}/${fileUuid}`);
    return new Uint8Array(found);
  }

  async deletePack(packUuid: string): Promise<void> {
    const prefix = `${packUuid}/`;
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix)) this.files.delete(key);
    }
  }
}

/**
 * Generate a v4 UUID. Uses `crypto.randomUUID` in browsers / node ≥ 19;
 * falls back to a random-hex composition for jsdom-ish environments
 * that don't expose it.
 */
export function uuidV4(): string {
  const g = globalThis as unknown as {
    crypto?: { randomUUID?: () => string; getRandomValues?: (buf: Uint8Array) => Uint8Array };
  };
  if (g.crypto?.randomUUID) {
    return g.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  g.crypto?.getRandomValues?.(bytes);
  // Version 4.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
