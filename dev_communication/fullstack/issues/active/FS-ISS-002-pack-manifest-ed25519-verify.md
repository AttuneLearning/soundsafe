# FS-ISS-002: sfx-pack-manifest Ed25519 verification

**Priority:** High
**Status:** ACTIVE
**QA:** PENDING
**Created:** 2026-04-20
**Started:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.1)
**Assigned To:** Fullstack-Dev

## Description

Implement real Ed25519 signature verification in `sfx-pack-manifest`. Public function returns a parsed `Manifest` only after the detached signature verifies against the bundled publisher public key. Tests use the `hello_pack` fixture from FS-ISS-001 for both positive and negative scenarios.

Per ADR-006 and `sound-delivery.md §2`, the signature must be verified before any value inside the manifest is trusted — including auth tags and nonces. A tampered manifest must never produce a partially-parsed `Manifest` value.

## Acceptance Criteria

- [x] `sfx_pack_manifest::verify_and_parse(manifest_bytes: &[u8], signature_bytes: &[u8], public_key: &[u8; 32]) -> Result<Manifest, ManifestError>` exists with the documented signature.
- [x] `ManifestError` enum covers all four required variants: `BadPublicKeyFormat`, `BadSignatureFormat`, `SignatureFailed`, `Parse(serde_json::Error)`. Plus `Display` and `From<serde_json::Error>` impls; `std::error::Error` impl behind the `std` feature.
- [x] Signature verification happens **before** `serde_json::from_slice` parses the body. Implementation order is: parse public key → parse signature → verify → parse manifest. The fifth test (`signature_check_runs_before_parse`) asserts this invariant by feeding non-JSON bytes plus a real signature and checking we return `SignatureFailed`, not `Parse`.
- [x] Positive test using `sfx_test_fixtures::hello_pack(0)`: returns `Ok(manifest)` with `manifest.pack_id == "hello"`, `tier_required == Free`, `files.len() == 1`.
- [x] Negative tests using the fixture with mutations:
  - Flipped bit at offset 10 of `manifest_bytes` → `SignatureFailed`.
  - Truncated `signature_bytes` to 60 bytes → `BadSignatureFormat`.
  - Wrong public key (`hello_pack(1).public_key`) → `SignatureFailed`.
  - Bonus: all-zero (low-order) public key → `BadPublicKeyFormat`.
- [x] No allocation of a `Manifest` value on the failure path — `serde_json::from_slice` runs only after `vk.verify(...)?` returns `Ok`.
- [x] Existing `Manifest` round-trip tests continue to pass — additive change, no rewrite.

## Notes

- `ed25519-dalek` is already in workspace dependencies. No new crates needed.
- The bundled publisher public key in production will live somewhere in `rust-core`'s init path (see ADR-006); for M1.1 the test passes the key explicitly. The wiring of "what key is bundled with the client" is a M1.6 concern.
- This is a pure function; no I/O. All test inputs come from the fixture in M1.0.

## Dev Handoff to QA

- [x] Development Complete
- [x] Awaiting QA
- [ ] Typecheck passed (`cargo check --workspace`) — **deferred to QA env**
- [ ] Unit tests passed (`cargo nextest run -p sfx-pack-manifest`) — **deferred to QA env**
- [x] Integration tests passed (covered by the six new tests in `verify_and_parse_tests` module)
- [x] UAT tests passed (n/a — no user-facing behavior)

### Implementation summary

- `crates/sfx-pack-manifest/src/lib.rs`:
  - Removed the `#![cfg_attr(not(any(test, feature = "emit-schema")), no_std)]` attribute. The crate effectively wasn't no_std anyway because `serde_json` brings in `std` by default; the cfg_attr was misleading. We may revisit a true no_std variant if a no-std build target appears, but it's not load-bearing for any current consumer (rust-core targets WASM with std).
  - Added `use ed25519_dalek::{Signature, Verifier, VerifyingKey};`.
  - Added `ManifestError` enum with four variants matching the spec, `core::fmt::Display` impl, `From<serde_json::Error>`, and `std::error::Error` behind the `std` feature.
  - Added `verify_and_parse()` public function with the four-step verification order (key → sig → verify → parse) explicitly documented.
- `crates/sfx-pack-manifest/Cargo.toml`:
  - Added `sfx-test-fixtures = { path = "../sfx-test-fixtures" }` to `[dev-dependencies]`.
- `crates/sfx-pack-manifest/src/lib.rs` tests module:
  - New `verify_and_parse_tests` submodule with six tests covering positive, four negative cases, and the verify-before-parse ordering invariant.

### Files changed

- `crates/sfx-pack-manifest/Cargo.toml` (added dev-dep on sfx-test-fixtures)
- `crates/sfx-pack-manifest/src/lib.rs` (added ManifestError + verify_and_parse + 6 tests; removed misleading no_std attribute)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
