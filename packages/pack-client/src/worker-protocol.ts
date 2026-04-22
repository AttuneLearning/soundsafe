// Wire protocol between the main-thread `PackClient` and the
// dedicated decrypt worker.

export interface UnlockRequest {
  kind: 'unlock';
  packId: string;
  sampleRate: number;
  blockSize: number;
  bundledPublicKey: Uint8Array;
  manifestBytes: Uint8Array;
  signatureBytes: Uint8Array;
  /** Base64-encoded encrypted files, already concatenated into a JSON
   * payload the Rust composite `loadPack` entry accepts. */
  encryptedFilesJson: string;
  /** Zeroed by the worker + WASM before the unlock response returns. */
  packKeyBytes: Uint8Array;
}

export interface DecryptedFile {
  path: string;
  plaintext_len: number;
  plaintext_b64: string;
}

export type WorkerResponse =
  | { kind: 'pong' }
  | { kind: 'unlocked'; packId: string; decrypted: ReadonlyArray<DecryptedFile> }
  | { kind: 'unlock-failed'; packId: string; error: string };
