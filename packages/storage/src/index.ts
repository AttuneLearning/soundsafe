// @soundsafe/storage — IndexedDB + OPFS wrappers + quota watchdog.
//
// Per ADR-011: progress is local-only; decrypted audio never lands in
// IndexedDB or Cache API (it goes to OPFS). Per ADR-025: OPFS files are
// stored under UUID names with no extensions.
//
// Implementation lands in M1.

export const __PACKAGE_NAME = '@soundsafe/storage';
