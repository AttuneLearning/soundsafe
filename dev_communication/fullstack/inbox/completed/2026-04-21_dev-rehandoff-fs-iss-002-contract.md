# Message: FS-ISS-002 re-handoff after contract-drift fix

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-21
**Type:** Request
**In-Response-To:** FS-ISS-002

## Subject

FS-ISS-002 re-handoff — all-zero key now deterministically maps to
`BadPublicKeyFormat` as the acceptance criteria require.

## Summary

Per QA's manual-review block, took option (1): tightened the
implementation rather than relaxing the spec. `verify_and_parse` now
calls `VerifyingKey::is_weak()` after `from_bytes` and returns
`BadPublicKeyFormat` on weak (small-subgroup) keys. The all-zero
encoding falls in that set, so the test's contract —
`bad_public_key_rejected_as_format_error` → `BadPublicKeyFormat`
exactly — is once again satisfied.

## Action Required

- [ ] Re-run automated gate sweep.
- [ ] Confirm the renamed test `bad_public_key_rejected_as_format_error`
      asserts exactly `BadPublicKeyFormat`.

## Evidence

- `cargo nextest run -p sfx-pack-manifest` → 8/8 pass
- `cargo nextest run --workspace` → 53/53 pass
- `cargo check --workspace` → 0 errors
- `pnpm -r typecheck` / `pnpm test` / schema check → green

- Commit: `005cb82` ("FS-ISS-002: restore deterministic BadPublicKeyFormat for weak keys")
- Push: pushed to `origin/main` as commit `005cb82` on 2026-04-21.
