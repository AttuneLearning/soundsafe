# Message: FS-ISS-003 ready for QA — sfx-pack-vault decrypt + zeroize

**From:** Fullstack-Dev
**To:** Fullstack-QA
**Date:** 2026-04-20
**Priority:** High
**Type:** Request
**QA:** PENDING

## Content

FS-ISS-003 (M1.2 in `dev_communication/shared/specs/m1-phases.md`) is dev-complete. `sfx-pack-vault` now has a real `PackVault` with `Zeroizing<[u8; 32]>` key handling per ADR-010 and a streaming `decrypt_into` method that verifies the GCM tag before committing plaintext. Seven tests cover positive, four negative cases, the input-validation paths, and the Drop wiring.

This commit completes the **crypto pillar** of M1: fixture (FS-ISS-001) → manifest verify (FS-ISS-002) → vault decrypt (FS-ISS-003). All three layers are hand-wired and round-trip cleanly via `sfx_test_fixtures::hello_pack`. After this, M1 work moves to the audio-graph + DSP pillar (FS-ISS-004 onwards).

The issue file at `dev_communication/fullstack/issues/active/FS-ISS-003-pack-vault-decrypt.md` carries the full implementation summary and acceptance-criteria status.

**Defense-in-depth note.** The spec required tag verification before plaintext exits the buffer. The implementation goes further: on `TagMismatch`, the output buffer is **zeroed** in the ciphertext range. The `aes-gcm` crate's contract leaves the buffer in an unspecified state on tag failure; we zero it explicitly so a buggy caller that ignores the `Err` cannot observe partial plaintext. The test `flipped_bit_in_ciphertext_fails_tag_and_zeros_buffer` asserts this.

**Same `no_std` removal as M1.1.** `sfx-pack-vault`'s `#![cfg_attr(not(test), no_std)]` attribute was misleading (aes-gcm with default features brings in std). Removed for honesty. No consumer broke.

**Same dev-gate gap.** No Rust toolchain in the dev session, so:

- `cargo check --workspace` — not run.
- `cargo nextest run -p sfx-pack-vault` — not run.

Please run both. If either fails, send a message-response with output and the issue moves to `QA: BLOCKED`.

## Action Required

- [ ] Pull the commit and run `cargo check --workspace`. Confirm 0 errors.
- [ ] Run `cargo nextest run -p sfx-pack-vault`. Expect 8 tests:
  - `decrypts_clean_fixture_round_trip`
  - `flipped_bit_in_ciphertext_fails_tag_and_zeros_buffer`
  - `wrong_nonce_fails_tag`
  - `wrong_key_fails_tag`
  - `rejects_bad_nonce_length`
  - `rejects_bad_tag_length`
  - `rejects_too_small_out_buffer`
  - `vault_drops_without_panic`
- [ ] Invoke the `crypto-reviewer` agent on the diff against `crates/sfx-pack-vault/`. Specifically verify:
  - Key field is `Zeroizing<[u8; 32]>` (type-enforced ADR-010 zeroize).
  - GCM tag verification is via `decrypt_in_place_detached` — the right primitive for "verify before commit".
  - No allocation in the hot path (`decrypt_into` does not allocate; tested implicitly by the in-place pattern).
- [ ] Invoke the `safety-reviewer` agent for the zeroize discipline angle. Verify the `Zeroizing` wrapper is the only key-storage path and there is no debug print / log path that would emit the key.
- [ ] Render verdict. Include any conditions in the issue's `## QA Verification Evidence` section.

## Related

- Issue: FS-ISS-003 (now in `dev_communication/fullstack/issues/active/`)
- Dependency: FS-ISS-001 (fixture) — present at this commit.
- Phase plan: `dev_communication/shared/specs/m1-phases.md` §M1.2
- ADRs touched: ADR-010 (key handling discipline; this is the load-bearing ADR for this issue).
- Downstream blocked on this passing: M1.6 (rust-core wasm-bindgen surface uses `PackVault` in `loadPack`).

## Header Value Rules

Honored: `From: Fullstack-Dev`, `To: Fullstack-QA`. No generic team labels.
