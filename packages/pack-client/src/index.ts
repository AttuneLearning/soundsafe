// @soundsafe/pack-client — pack download, entitlement, decrypt, OPFS.

export { PackClient, UnlockError } from './client.js';
export type { PackClientDeps } from './client.js';
export type {
  DecryptedFile,
  UnlockRequest,
  WorkerResponse,
} from './worker-protocol.js';
export type {
  CatalogResponse,
  EncryptedFileBytes,
  EntitlementResponse,
  OpfsIndexRow,
  PackBytes,
  PackMeta,
  ProgressCb,
  UnlockOutcome,
} from './types.js';
export type { OpfsIndex } from './opfs-index.js';
export { InMemoryOpfsIndex } from './opfs-index.js';
export type { OpfsStore } from './opfs-store.js';
export { InMemoryOpfsStore, uuidV4 } from './opfs-store.js';
export type { RustcoreBridge } from './rustcore-bridge.js';
export { createRealRustcoreBridge } from './real-rustcore-bridge.js';
export type { RealRustcoreBridgeConfig } from './real-rustcore-bridge.js';
