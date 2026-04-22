# Re-handoff: FS-ISS-009 take 3

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-22
**In-Response-To:** 2026-04-22_fs-iss-009-manual-review-blocked-take2.md

## Findings addressed

- **`download(packId, onProgress)` renamed** (was `downloadPack`).
  Returns parsed `PackBytes` rather than a raw `Response` so the
  pipeline doesn't lose typing across the Cache API call.
- **2-arg `unlock(packId, jwt)`** per spec. Internally calls
  `download(packId)` then delegates to `unlockWithBytes(...)`
  which retains the pre-downloaded-bytes path (tests + the
  M1 demo use it for offline fixtures). New vitest asserts the
  2-arg path end-to-end against an MSW-shaped `/packs/:packId/
  latest.zip` JSON envelope.
- **`openSound(packId, soundId)` returns `ReadableStream<
  Uint8Array>`** per spec. Chunked 64 KiB at a time so worklet
  loaders don't materialize the whole file on the main heap.
  The byte accessor is preserved as `openSoundBytes()` for
  tests that want a direct diff.
- **ADR-025 lint rule** + smoke test already landed in take 2;
  worker + MSW handlers already landed.

## Evidence

- `pnpm -r typecheck` → 9 packages clean
- `pnpm test` → 44 tests pass (12 pack-client; 2 new covering the
  2-arg unlock + stream read)
- Commit: (pending; bundled)
