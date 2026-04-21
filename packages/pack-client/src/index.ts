// @soundsafe/pack-client — CDN fetch, Service Worker pack cache,
// decrypt-worker orchestration.
//
// OPFS hardening (ADR-025) lives here:
//   - Decrypted files are stored under v4-UUID names with no extensions.
//   - URL.createObjectURL on OPFS handles is forbidden by lint rule.
//   - The opfs_index mapping table (in IndexedDB) resolves soundId → handle.
//
// Implementation lands in M1.

export const __PACKAGE_NAME = '@soundsafe/pack-client';
