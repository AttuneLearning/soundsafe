# FS-ISS-009: @soundsafe/pack-client decrypt-worker + MSW entitlement + OPFS hardening

**Priority:** High
**Status:** QUEUE
**QA:** PENDING
**Created:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.8)
**Assigned To:** Fullstack-Dev

## Description

TypeScript-side pack download, entitlement exchange, decrypt-worker orchestration, and OPFS hardening. Per ADR-020, decryption happens in a dedicated Web Worker (not on main, not in the audio worklet) so the crypto CPU doesn't block the UI during pack load. Per ADR-025, decrypted audio lands in OPFS under opaque UUID-named files (no extensions, UUID-named per-pack directories) and must not be addressable via `URL.createObjectURL`.

For M1, entitlement is MSW-mocked (real Stripe + real Cloudflare Worker is M2). The mock returns `sfx_test_fixtures::hello_pack` data so the end-to-end flow from M1.9's consumer-app is exercised against the real verify + decrypt chain.

## Acceptance Criteria

- [ ] `PackClient` class in `packages/pack-client/src/client.ts`:
  - `listCatalog(): Promise<PackMeta[]>` — fetches `latest.json` from the (mocked) CDN.
  - `download(packId: string, onProgress: ProgressCb): Promise<void>` — fetches the encrypted pack zip via Cache API.
  - `unlock(packId: string, jwt: string): Promise<void>` — POSTs `/entitlement` with the JWT, receives the pack key, hands both to the decrypt worker. Pack key transits JS heap for one microtask only.
  - `openSound(packId: string, soundId: string): Promise<ReadableStream>` — returns a stream reading from OPFS under the mapped UUID. The stream is consumed by `audio-graph-ts` to feed the worklet.
  - `evict(packId: string): Promise<void>` — deletes OPFS files + manifest entry + `opfs_index` rows for the pack.
- [ ] Decrypt worker at `packages/pack-client/src/worker.ts`:
  - Runs in a dedicated `Worker` (not the audio worklet).
  - Loads the `rust-core` WASM module (a second instance, per ADR-020).
  - `onmessage({ type: 'unlock', packId, manifestBytes, signatureBytes, encryptedFiles, packKeyBytes })`:
    1. Calls `rust_core.verify_and_parse` to verify the manifest signature.
    2. Calls `rust_core.load_pack` with the verified manifest + pack key. Inside WASM, `PackVault::decrypt_into` is called per file; plaintext is emitted as a `Vec<u8>`.
    3. The worker writes each plaintext file to OPFS under a v4-UUID name with no extension (see below).
    4. **Immediately** zeros the `packKeyBytes: Uint8Array` on the worker's JS heap (`.fill(0)`).
    5. Posts `{ type: 'unlock-complete', packId }` back to the main thread.
- [ ] OPFS hardening (ADR-025):
  - Per-pack directory under OPFS uses a v4 UUID name (e.g. `a8f9c3d2-...`) with no relation to the pack ID.
  - Each decrypted audio file has a v4-UUID filename with **no extension** (`f47ac10b-58cc-4372-a567-0e02b2c3d479`).
  - IndexedDB `opfs_index` table: `{ packId, soundId, opfsPackUuid, opfsFileUuid, sha256, bytes }`. Populated on unlock; read on `openSound`.
  - **Lint rule** in `packages/pack-client/eslint.config.js` (or project root): `no-restricted-syntax` rejects `URL.createObjectURL` called with any argument whose type flows from `FileSystemFileHandle.getFile()`. Include a failing-test fixture in `src/__tests__/lint-createobjecturl.test.ts` verifying the rule fires.
- [ ] MSW mock setup at `packages/pack-client/src/__mocks__/handlers.ts`:
  - `POST /entitlement` returns `{ pack_key: base64(hello_pack.pack_key) }` when the JWT scope includes `"pack:hello"`.
  - `GET /latest.json` returns `{ packs: { hello: "2026-04-20.1" }, min_app_version: "0.1.0" }`.
  - `GET /packs/hello/v2026-04-20.1.zip` returns a zip containing the `hello_pack` manifest + signature + encrypted files.
  - Note: the hello_pack fixture is Rust-only (`sfx-test-fixtures`). The TS mock needs a small helper that invokes `cargo run -p sfx-test-fixtures --example dump-hello-pack` at test-setup time to get the bytes. Alternative: pre-dump the bytes once and check them in under `packages/pack-client/__fixtures__/hello-pack/`.
- [ ] Vitest coverage:
  - `PackClient.unlock` happy path end-to-end (MSW + worker + WASM + OPFS write). Verify the `opfs_index` row appears, the OPFS file exists under the UUID name, and the sha256 matches.
  - `openSound` returns a stream that reads the expected plaintext.
  - Key zeroize: after `unlock` resolves, the `packKeyBytes` reference held by the test is all zeros.
  - Tampered manifest bytes → unlock rejects.
  - Wrong JWT scope → `/entitlement` returns 403 → unlock rejects.
  - Lint rule fires on the test fixture.

## Notes

- The decrypt worker runs a **second** WASM instance (the first is in the audio worklet per ADR-020). Both are built from the same `rust-core` but load independently.
- Pack key handoff: the worker receives the key via `postMessage` from main. Main's copy of the key exists for one microtask (from `await fetch('/entitlement').then(r => r.json())` → `worker.postMessage({..., packKeyBytes})`). Zero the main-side `Uint8Array` immediately after postMessage returns.
- The MSW handlers run only in test; the production config points at real Cloudflare Worker endpoints (wired in M2).
- `@soundsafe/pack-client` is a dependency of `@soundsafe/consumer-app` (consumed in M1.9). Keep the surface minimal.

## Dependencies

- **M1.6 (FS-ISS-007)** — `rust-core` wasm-bindgen surface.
- **M1.7 (FS-ISS-008)** — not strictly a code dep, but the `AudioEngine` in M1.7 is what calls `PackClient.openSound` in the consumer-app integration (M1.9).

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`pnpm -r typecheck`)
- [ ] Unit tests passed (`pnpm --filter @soundsafe/pack-client test`)
- [ ] Integration tests passed (see the OPFS + MSW scenarios above)
- [ ] UAT tests passed (n/a — consumed by M1.9)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
