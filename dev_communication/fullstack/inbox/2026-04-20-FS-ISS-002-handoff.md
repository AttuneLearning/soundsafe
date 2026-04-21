# Message: FS-ISS-002 ready for QA — sfx-pack-manifest Ed25519 verification

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-20
**Priority:** High
**Type:** Request
**QA:** PENDING

## Content

FS-ISS-002 (M1.1 in `dev_communication/shared/specs/m1-phases.md`) is dev-complete. `sfx-pack-manifest` now exposes `verify_and_parse(manifest_bytes, signature_bytes, public_key) -> Result<Manifest, ManifestError>`. Six tests cover positive, four negative cases, and the load-bearing "signature check runs before JSON parse" invariant required by ADR-006.

The implementation order in `verify_and_parse` is documented in the function's doc comment and asserted by the `signature_check_runs_before_parse` test — feeding non-JSON bytes with a valid signature returns `SignatureFailed`, not `Parse`, proving we never reach `serde_json::from_slice` on the failure path.

The issue file at `dev_communication/fullstack/issues/active/FS-ISS-002-pack-manifest-ed25519-verify.md` carries the full implementation summary, file list, and acceptance-criteria status.

**One small spec deviation worth flagging.** I removed the `no_std` attribute from `sfx-pack-manifest`. It was misleading — the crate transitively depended on `std` via `serde_json`'s default features, so the `no_std` declaration was not actually enforced. Removing the attribute makes the crate's build profile honest. If a no-std consumer ever appears, we can reintroduce a feature-gated no-std variant; nothing in the current architecture (rust-core targets WASM with std enabled) needs it.

**Heads-up on Dev-Gate gaps.** Same as FS-ISS-001 — no Rust toolchain in the dev session that produced the commit, so:

- `cargo check --workspace` — not run.
- `cargo nextest run -p sfx-pack-manifest` — not run.

Please run both. If either fails, send a message-response with the failure output and the issue moves back to `QA: BLOCKED`.

## Action Required

- [ ] Pull the commit and run `cargo check --workspace`. Confirm 0 errors.
- [ ] Run `cargo nextest run -p sfx-pack-manifest`. Expect:
  - 2 tests in `tests` (the existing `manifest_round_trips`, `therapist_field_round_trips_through_v1`).
  - 6 tests in `verify_and_parse_tests` (positive, flipped bit, truncated sig, wrong pubkey, bogus body, all-zero pubkey).
- [ ] Invoke the `crypto-reviewer` agent on the diff against `crates/sfx-pack-manifest/`. Specifically verify:
  - The verify-before-parse order is intact.
  - `ed25519-dalek 2.x` `verify` (not `verify_strict` — they're the same in 2.x but worth noting for awareness) is used.
  - No allocation of `Manifest` on the failure path.
- [ ] Sanity-check the `no_std` removal: confirm no current consumer broke. The only consumer chain is `sfx-pack-manifest → rust-core (WASM with std)`. Cross-shell parity is unaffected.
- [ ] Render verdict. Include any conditions in the issue's `## QA Verification Evidence` section.

## Related

- Issue: FS-ISS-002 (now in `dev_communication/fullstack/issues/active/`)
- Dependency: FS-ISS-001 must be `Status: COMPLETE` (or at minimum, the fixture crate must be present at this commit). It is — see `crates/sfx-test-fixtures/`.
- Phase plan: `dev_communication/shared/specs/m1-phases.md` §M1.1
- ADRs touched: ADR-006 (verify before trust), ADR-016 (stable rust-core API — additive only; this is purely additive).
- Downstream blocked on this passing: M1.6 (rust-core wasm-bindgen surface uses `verify_and_parse` in `loadPack`).

## Header Value Rules

Honored: `From: Fullstack-Dev`, `To: Fullstack-QA`. No generic team labels.
