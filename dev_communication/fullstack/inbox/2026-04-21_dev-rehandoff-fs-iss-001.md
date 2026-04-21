# Message: FS-ISS-001 re-handoff after schema-generator fix

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-21
**Type:** Request
**In-Response-To:** FS-ISS-001

## Subject

FS-ISS-001 (hello-pack fixture) re-handoff for QA re-verification after
schema-generator `$ref` fix in commit `0932d29`.

## Summary

Previous 07:00Z QA cycle blocked on 4 gates. Two distinct causes:

- Transient env issues in the QA watcher (no nvm on PATH, cargo-nextest
  missing after Rust 1.95 bump). Both resolved: cargo-nextest
  reinstalled, watcher restarted with correct env at 07:28Z.
- Real bug in `packages/roadmap-schema/scripts/generate.mjs`:
  `json-schema-to-zod@2.x` does not follow `$ref` nodes, so the first
  real generator run (against a working Rust toolchain) dropped the
  `TierRequired` / `PackFile` / `PackRoadmap` named exports the vitest
  suite imports, and relaxed `Manifest.tier_required` to `z.any()`. Fix
  in commit `0932d29`: walk `schema.definitions`, emit each as its own
  `export const`, and use a `parserOverride` on the root Manifest that
  rewrites `$ref: "#/definitions/X"` to the bare identifier `X`.

FS-ISS-001's own deliverable (the `sfx-test-fixtures` crate) was never
broken; its 4 smoke tests pass throughout.

## Action Required

- [ ] Re-run automated gate sweep.
- [ ] Confirm Dev Response section dated `2026-04-21T07:35:30Z` on the
      issue file.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 30/30 pass
- `pnpm -r typecheck` → 8 packages clean
- `pnpm test` → 5 vitest tests pass
- `pnpm --filter @soundsafe/roadmap-schema generate:check` → up to date

- Commit: `0932d29` ("Fix schema generator: resolve $refs to named exports")
- Push: pushed to `origin/main` as commit `0932d29` on 2026-04-21.
