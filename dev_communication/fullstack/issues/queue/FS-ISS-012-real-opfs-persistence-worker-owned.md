# FS-ISS-012: Real OPFS persistence with worker-owned writes

**Priority:** High
**Status:** QUEUED
**QA:** N/A
**Created:** 2026-04-29
**Started:** —
**Requested By:** Adam (M1-UAT carryover; closes FS-ISS-009 take-3 narrowing + missing real OPFS impls)
**Assigned To:** Fullstack-Dev

## Description

Ship a real OPFS-backed `OpfsStore` and a real IndexedDB-backed `OpfsIndex`, and move ownership of the decrypt-to-OPFS write step from the main thread into the existing decrypt worker. Together these close the two open carryovers from M1.8 (FS-ISS-009) that prevent the consumer app's "production browser path" from being a real end-to-end stack: today even when `WebAudioHost` + real `RustcoreBridge` are selected, the app still wires `InMemoryOpfsStore` / `InMemoryOpfsIndex` (`packages/consumer-app/src/App.tsx:64-70`), and the OPFS write happens on the main thread (`packages/pack-client/src/client.ts:171-205`) instead of in the worker the issue assigns ownership to.

Per ADR-025, plaintext bytes must never round-trip through main-thread JS heap memory after decryption — the worker should decrypt and persist in one continuous flow. Per ADR-020, the second WASM instance lives in this worker; OPFS writes belong to the same execution context.

## Acceptance Criteria

### Real OPFS storage

- [ ] `WebOpfsStore` class in `packages/pack-client/src/web-opfs-store.ts` implementing the existing `OpfsStore` interface using `navigator.storage.getDirectory()`.
  - Per-pack directory is a v4-UUID name with no relation to `packId` (ADR-025).
  - Each file has a v4-UUID name with **no extension** (ADR-025).
  - `getReadable(packUuid, fileUuid): Promise<ReadableStream<Uint8Array>>` returns a stream from `FileSystemFileHandle.getFile().stream()`.
  - `getBytes(packUuid, fileUuid): Promise<Uint8Array>` reads to `Uint8Array` for the byte-accessor path.
  - `evictPack(packUuid): Promise<void>` removes the pack directory recursively.
  - **No `URL.createObjectURL` anywhere in the implementation** — verified by the existing ADR-025 lint rule.
- [ ] `IndexedDbOpfsIndex` class in `packages/pack-client/src/idb-opfs-index.ts` implementing the existing `OpfsIndex` interface using the browser `IDBDatabase` API.
  - Object store name `opfs_index`, key path `[packId, soundId]`, columns per the existing `OpfsIndexRow` shape (`{ packId, soundId, opfsPackUuid, opfsFileUuid, sha256, bytes }`).
  - `record(row)`, `lookup(packId, soundId)`, `evictPack(packId)` all promise-based wrappers.
- [ ] Both implementations exported from `packages/pack-client/src/index.ts` alongside the existing `InMemory*` exports.
- [ ] `packages/consumer-app/src/App.tsx`'s `createDefaultServices()` uses `WebOpfsStore` + `IndexedDbOpfsIndex` on the production browser branch (the one that already picks `WebAudioHost` + `createRealRustcoreBridge`). Tests continue to inject `InMemory*` shims.

### Worker-owned writes

- [ ] `packages/pack-client/src/worker.ts` accepts an `OpfsStore` + `OpfsIndex` (or, equivalently, a small worker-side wrapper around a `FileSystemDirectoryHandle` transferred from main once at init) and performs the OPFS write itself, immediately after decrypt and before posting back.
  - Worker message protocol: `{ type: 'unlock', packId, manifestBytes, signatureBytes, encryptedFiles, packKeyBytes, opfsPackUuid }` → on success `{ type: 'unlocked', packId, files: [{ soundId, opfsFileUuid, sha256, bytes }] }`. Plaintext bytes are **never** posted back to main.
  - Main-thread `PackClient.unlock` only records the index rows from the worker's `unlocked` payload.
  - `packages/pack-client/src/client.ts:171-205` no longer has any branch that writes plaintext to OPFS on main; the only main-thread mutation is `opfsIndex.record(...)`.
- [ ] Worker still zeros `packKeyBytes` in its `finally` block (existing behavior preserved).

### Tests

- [ ] Unit tests for `WebOpfsStore` and `IndexedDbOpfsIndex` using either the browser-emulating test runner already in this package (vitest + happy-dom) or a small `fake-indexeddb` / `@webcontainer/api`-style shim — whichever is cheaper. If no real OPFS shim is feasible in vitest, integration coverage moves to FS-ISS-014's E2E and the unit tests assert at the interface boundary only.
- [ ] Updated `client.test.ts` proves: when a real worker is provided, plaintext never flows through main-thread message inspection (use a wrapping `Worker`-double that fails the test if any inbound message has a `bytes` field on the failure path).
- [ ] No regression on the existing 45 vitest tests / 81 cargo tests.

## Notes

- The existing `worker.ts` already loads a second rust-core WASM via the injected `__soundsafeRustcoreLoader`. Add the OPFS write step inside the worker without changing how WASM loads.
- IndexedDB is fine to use directly here — no `idb` dependency needed unless complexity warrants it; the surface is three operations.
- ADR-025 requires the lint rule already shipped in FS-ISS-009 take-2 to remain green; new code must not regress it. The existing lint test fixture must still fire.
- This issue does **not** add a new pack format, change the manifest, or touch the rust-core surface. It's purely the TS persistence layer and worker ownership.

## Dependencies

- **FS-ISS-009** must be QA-closed (or formally accepted as narrowed) first; this issue picks up its take-3 carryover.
- **FS-ISS-007** (rust-core wasm-bindgen surface) and **FS-ISS-008** (audio-graph-ts) — already implemented; no code changes required here.

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`pnpm -r typecheck`)
- [ ] Unit tests passed (`pnpm test`)
- [ ] Integration tests passed (manual: load hello pack on the production browser path, verify entries appear in DevTools → Application → IndexedDB and OPFS)
- [ ] UAT tests passed (deferred to FS-ISS-014's UAT pass)

## Dev Response

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
