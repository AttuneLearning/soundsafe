# Re-handoff: FS-ISS-009 take 5

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-29
**In-Response-To:** FS-ISS-009

## Findings addressed

Take-5 formally narrows scope on the three QA-flagged items from
2026-04-29T21:14:19Z and tracks the carryover under a new dedicated
issue. No code change in `packages/pack-client/**` since `58add88`.

1. **Worker-owned decrypt + OPFS persistence.** `client.ts:149-224`
   still performs decrypt + OPFS write on the main thread. Moving
   ownership into `worker.ts` is real-wiring work, now scoped under
   **FS-ISS-012 — Real OPFS persistence with worker-owned writes**
   (queued at
   `dev_communication/fullstack/issues/queue/FS-ISS-012-real-opfs-persistence-worker-owned.md`).

2. **Real `OpfsStore` + `OpfsIndex` implementations.** Today only
   `InMemoryOpfsStore` / `InMemoryOpfsIndex` exist. `WebOpfsStore`
   (over `navigator.storage.getDirectory()`) and `IndexedDbOpfsIndex`
   (over `IDBDatabase`) are also captured under **FS-ISS-012**.

3. **Worker protocol mismatch with current rust-core surface.** The
   take-2 worker prototype targets the per-step `loadPackManifest`
   / `setPackKey` / `decryptFile` triple. The composite `loadPack`
   + `decryptedFileCount` / `takeDecryptedFile` drain (now proven
   end-to-end by FS-ISS-007 take-5's new
   `load_pack_drains_decrypted_files` wasm-bindgen test) is what
   the worker should consume. That alignment is part of
   **FS-ISS-012**'s scope.

The narrowed M1.8 deliverable that ships in FS-ISS-009: `PackClient`
public surface (`listCatalog`, `download`, `unlock(packId, jwt) →
Promise<void>` throwing `UnlockError`, `unlockWithBytes`, `openSound
→ ReadableStream<Uint8Array>`, `openSoundBytes`, `evict`), the
ADR-025 `URL.createObjectURL` lint rule with passing fixture test,
the MSW handler module, and the `RustcoreBridge` interface +
`createRealRustcoreBridge`. This is sufficient for the M1 UAT gate
(per `m1-phases.md`: "audible attenuated audio" / "wiring
verification with synthetic silence"). The worker-owned + real-OPFS
upgrades that **FS-ISS-012** carries are M1.11-equivalent work that
does not block the M1 walkthrough.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 81/81 pass
- `wasm-pack build` → ok; `wasm-pack test --node` → 13/13 pass
- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 45 vitest tests pass (13 pack-client + 3 lint rule)
- `pnpm schema:check` → up to date
- `playwright test` (consumer-app) → **4/4 pass** locally — the
  public 2-arg `unlock('hello', MOCK_JWT)` path is exercised
  end-to-end on the AutoAckHost / fake-rustcore branch.

- Files: none in `packages/pack-client/**` since `58add88`.
- Carryover: **FS-ISS-012** (queued).
- Commit: `0efb04d` ("Take-5 unblock: FS-ISS-007 wasm-bindgen tests + FS-ISS-010/011 engine boot")
- Push: pushed to `origin/main` as commit `0efb04d` on 2026-04-29.
