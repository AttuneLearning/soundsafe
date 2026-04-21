// Public types for @soundsafe/pack-client.

export interface PackMeta {
  packId: string;
  version: string;
  /** Tier-required string; mirrors roadmap-schema's TierRequired. */
  tier: 'free' | 'relaxation' | 'interactive';
}

export interface CatalogResponse {
  packs: Record<string, string>;
  minAppVersion: string;
}

export interface EncryptedFileBytes {
  path: string;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  tag: Uint8Array;
}

export interface PackBytes {
  packId: string;
  manifestBytes: Uint8Array;
  signatureBytes: Uint8Array;
  files: EncryptedFileBytes[];
}

export interface OpfsIndexRow {
  packId: string;
  soundId: string;
  opfsPackUuid: string;
  opfsFileUuid: string;
  sha256: string;
  bytes: number;
}

export interface EntitlementResponse {
  packKeyBase64: string;
}

export type ProgressCb = (fraction: number) => void;

export type UnlockOutcome =
  | { kind: 'ok' }
  | { kind: 'manifest-rejected'; message: string }
  | { kind: 'entitlement-rejected'; status: number }
  | { kind: 'decrypt-failed'; path: string; message: string };
