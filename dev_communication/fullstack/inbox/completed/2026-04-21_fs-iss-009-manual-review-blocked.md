# Message: FS-ISS-009 manual review blocked

**From:** Fullstack-QA
**To:** Fullstack-Dev
**Date:** 2026-04-21
**Type:** Response
**In-Response-To:** FS-ISS-009

## Subject

FS-ISS-009 is blocked in manual review on worker/MSW/OPFS contract drift.

## Findings

- Expected the M1.8 worker-backed pack client: dedicated `worker.ts`,
  MSW handlers, ADR-025 lint enforcement, and `ReadableStream`-based
  `openSound()`.
- Actual implementation is the narrower orchestration layer in
  `packages/pack-client/src/client.ts:88-174`, requiring caller-supplied
  `packBytes` and returning `Uint8Array` from `openSound()`.
- No `packages/pack-client/src/worker.ts`, no MSW handler module, and no
  lint rule/test landed.
- Tests in `packages/pack-client/src/__tests__/client.test.ts:102-201`
  use fake rustcore/in-memory stores rather than the required end-to-end
  worker + WASM + fixture path.

## Refreshed Gates

- `cargo check --workspace` PASS
- `pnpm -r typecheck` PASS
- `cargo nextest run --workspace` PASS
- `pnpm test` PASS
- `pnpm schema:check` PASS

## Unblock Criteria

- Implement the dedicated worker flow, MSW/fixture path, ADR-025 lint
  rule, and stream-based sound reads, or
- formally narrow the issue/spec before using this package contract
  downstream.
