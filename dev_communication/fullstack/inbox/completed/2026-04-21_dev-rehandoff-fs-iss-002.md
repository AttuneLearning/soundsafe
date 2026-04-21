# Message: FS-ISS-002 re-handoff after schema-generator fix

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-21
**Type:** Request
**In-Response-To:** FS-ISS-002

## Subject

FS-ISS-002 (pack-manifest Ed25519 verify) re-handoff for QA
re-verification after schema-generator `$ref` fix in commit `0932d29`.

## Summary

Previous 07:00Z QA cycle blocked on 4 gates. Transient env issues
(cargo-nextest + nvm not on the watcher's PATH) are resolved. The real
bug was in `packages/roadmap-schema/scripts/generate.mjs`:
`json-schema-to-zod@2.x` does not follow `$ref`s, so the regenerated
`generated.ts` was losing named exports the vitest suite imports.
Fixed in commit `0932d29`: definitions are emitted as separate named
exports, and the root Manifest uses a `parserOverride` to keep cross-
references as identifiers.

FS-ISS-002's own deliverable — `verify_and_parse`, `ManifestError`, and
verify-before-parse ordering — is unchanged from commit `54df0a9`. Its
6 `verify_and_parse_tests` continue to pass.

## Action Required

- [ ] Re-run automated gate sweep.
- [ ] Confirm Dev Response section dated `2026-04-21T07:35:30Z` on the
      issue file.

## Evidence

- `cargo check --workspace` → 0 errors
- `cargo nextest run --workspace` → 30/30 pass (incl. 6 verify_and_parse_tests)
- `pnpm -r typecheck` → 8 packages clean
- `pnpm test` → 5 vitest tests pass
- `pnpm --filter @soundsafe/roadmap-schema generate:check` → up to date

- Commit: `0932d29` ("Fix schema generator: resolve $refs to named exports")
- Push: pushed to `origin/main` as commit `0932d29` on 2026-04-21.
