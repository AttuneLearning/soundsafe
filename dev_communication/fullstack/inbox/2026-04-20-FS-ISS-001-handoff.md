# Message: FS-ISS-001 ready for QA — hello-pack test fixture

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-20
**Priority:** High
**Type:** Request
**QA:** PENDING

## Content

FS-ISS-001 (M1.0 in `dev_communication/shared/specs/m1-phases.md`) is dev-complete. The `crates/sfx-test-fixtures` crate is added with a deterministic `hello_pack(seed: u64) -> HelloPack` generator. All crypto is real (AES-256-GCM + Ed25519). Smoke tests in the fixture crate cover round-trip decrypt, determinism, seed-independence, and signature-verifies-against-public-key.

This fixture is the input for FS-ISS-002 (manifest verify) and FS-ISS-003 (vault decrypt) downstream — gating it through QA before those phases land prevents a chain of broken-fixture failures.

The issue file at `dev_communication/fullstack/issues/active/FS-ISS-001-hello-pack-fixture.md` carries the full implementation summary, file list, and acceptance-criteria status.

**Heads-up on Dev-Gate gaps.** Two of the standard dev-gate checks are not run in this dev session — there is no Rust toolchain in the dev environment that produced the commit. Specifically:

- `cargo check --workspace` — not run.
- `cargo nextest run -p sfx-test-fixtures` — not run.

Please run both as part of QA verification. If either fails, send a message-response with the failure output and the issue moves back to `QA: BLOCKED`.

## Action Required

- [ ] Pull the commit and run `cargo check --workspace`.
- [ ] Run `cargo nextest run -p sfx-test-fixtures` — expect 4 tests passing (smoke round-trip, determinism, seed-independence, signature-verifies).
- [ ] Invoke the `crypto-reviewer` agent on the diff against `crates/sfx-test-fixtures/`. Verify ADR-010 alignment (key handling) and that no production crate gained a runtime dep.
- [ ] Manually inspect `Cargo.toml` workspace dep additions (`sha2`, `base64`, `rand`, `rand_chacha`) — they are intentional and used by the fixture; confirm versions are reasonable (`sha2 0.10`, `base64 0.22`, `rand 0.8`, `rand_chacha 0.3`).
- [ ] Confirm `sfx-test-fixtures` is `publish = false` — it must never reach a registry.
- [ ] Render verdict: Pass | Pass with Conditions | Blocked | Need More Info. Include any conditions in the issue's `## QA Verification Evidence` section.

## Related

- Issue: FS-ISS-001 (now in `dev_communication/fullstack/issues/active/`)
- Phase plan: `dev_communication/shared/specs/m1-phases.md` §M1.0
- ADRs touched: ADR-010 (key handling discipline), ADR-018 (TDD with proptest — proptest mandate doesn't apply to fixture crates).
- Downstream blocked on this passing: FS-ISS-002 (M1.1 manifest verify), FS-ISS-003 (M1.2 vault decrypt).

## Header Value Rules

Honored: `From: Fullstack-Dev`, `To: Fullstack-QA`. No generic team labels.
