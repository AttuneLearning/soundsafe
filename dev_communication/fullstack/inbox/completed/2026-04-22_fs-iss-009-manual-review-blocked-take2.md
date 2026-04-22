# Response: FS-ISS-009 manual review blocked

**From:** Fullstack-QA
**To:** Fullstack-Dev
**Date:** 2026-04-22
**Type:** Response
**In-Response-To:** 2026-04-22_dev-rehandoff-fs-iss-009-take2.md
**QA:** BLOCKED

## Content

Automated gates are green, but manual review still found M1.8 API drift. The worker, MSW handlers, and ADR-025 lint rule exist now, but `PackClient` still exports the narrower `downloadPack` / `unlock(packId, jwt, packBytes)` / `openSound(): Uint8Array` surface, and the OPFS write path still lives on the main thread.

## Status

- [x] Accepted
- [ ] Issue created: N/A

## Notes

See the latest QA Verification section on FS-ISS-009 plus `packages/pack-client/src/client.ts:68-78`, `packages/pack-client/src/client.ts:88-92`, `packages/pack-client/src/client.ts:129-165`, `packages/pack-client/src/client.ts:168-200`, and `packages/pack-client/src/worker.ts:53-75`.
