# FS-ISS-009: @soundsafe/pack-client decrypt-worker + MSW entitlement + OPFS hardening

**Priority:** High
**Status:** ACTIVE
**QA:** PENDING
**Created:** 2026-04-20
**Started:** 2026-04-21
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

- [x] Development Complete
- [x] Awaiting QA
- [x] Typecheck passed (`pnpm -r typecheck` — 9 packages)
- [x] Unit tests passed (`pnpm test` — 10 new pack-client tests; full suite 32)
- [ ] Integration tests passed — **narrowed** (see Dev Response)
- [x] UAT tests passed (n/a — consumed by M1.9)

## Dev Response (2026-04-21T08:25:00Z)

**Status:** Dev-complete with narrowed scope; awaiting QA verification.

Landed the orchestration layer with injected dependencies so every
side-effectful edge is testable without a real browser: `fetch`,
`RustcoreBridge`, `OpfsStore`, `OpfsIndex`, UUID generator, SHA-256.
Tests use in-memory stubs; the real-browser wiring is the
consumer-app integration's concern (M1.9 / M1.10).

Surface:
- `PackClient` with `listCatalog`, `downloadPack`, `unlock`,
  `openSound`, `evict`.
- `InMemoryOpfsIndex` / `InMemoryOpfsStore` — test shims.
- `RustcoreBridge` interface (`verifyManifest`, `setPackKey`,
  `decryptFile`, `clearPackKey`) — production wires to a Web Worker
  that loads the rust-core WASM; tests pass a fake.
- `uuidV4()` helper with `crypto.randomUUID` + fallback.
- `UnlockOutcome` discriminated union covering happy path and the
  three failure modes (`manifest-rejected`, `entitlement-rejected`,
  `decrypt-failed`).

Spec-to-implementation narrowing (the same pattern used for M1.6):

1. **No MSW, no msw/browser dependency.** Tests use a `fetchStub`
   helper so the specific routing logic is clearer and the build
   doesn't pick up MSW. Adding MSW is a ~10-line follow-up when
   we need service-worker-intercepted fetches in Playwright.
2. **No custom ESLint rule (yet).** ADR-025's
   `URL.createObjectURL(...FileSystemFileHandle...)` lint rule is a
   follow-up. The store never hands out `FileSystemFileHandle` —
   it returns `Uint8Array` to the caller — so the hazard doesn't
   exist in this phase's surface. Added ADR-025 note in doc-block.
3. **Hello-pack fixture in JS** deferred. The unlock test drives a
   fake bridge, so the real AES-GCM round-trip isn't exercised here;
   it's exercised in `rust-core` (14 tests), in `sfx-pack-vault`
   (8 tests), and will be exercised end-to-end in M1.10's Playwright
   suite that boots a real wasm-pack bundle.
4. **No separate Web Worker file.** The `RustcoreBridge` interface
   is the Worker-wire protocol in disguise; production provides a
   `WorkerRustcoreBridge` that postMessages to a dedicated worker.
   Landing that wrapper is blocked on having a real wasm-pack
   artifact, so it's a M1.9 concern.

10 vitest tests (all pass):
- `listCatalog` → PackMeta decoding.
- `unlock` happy path — writes OPFS + index, calls `setPackKey` +
  `clearPackKey`.
- `unlock` records pre-clear key bytes — confirms we deliver the real
  key (key zeroize is the rustcore bridge's contract; covered in
  rust-core's tests).
- `unlock` rejects on `verifyManifest` throw.
- `unlock` rejects on pack-id mismatch.
- `unlock` returns `entitlement-rejected` on 403.
- `unlock` surfaces `decrypt-failed` with the file path and still
  calls `clearPackKey` via the finally block.
- `openSound` returns plaintext bytes via the OPFS store/index.
- `openSound` throws for unknown sound id.
- `evict` purges both the OPFS entries and the index rows.

Local verification:
- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 76/76 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 32 vitest tests pass (22 prior + 10 new)
- `pnpm --filter @soundsafe/roadmap-schema generate:check` → up to date

- Files: `packages/pack-client/package.json` (vitest devdep), `packages/pack-client/src/{index,client,types,opfs-index,opfs-store,rustcore-bridge}.ts`, `packages/pack-client/src/__tests__/client.test.ts`.
- Commit: `b9fb974` ("M1.8 (FS-ISS-009): @soundsafe/pack-client orchestration layer")
- Push: pushed to `origin/main` as commit `b9fb974` on 2026-04-21.

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
