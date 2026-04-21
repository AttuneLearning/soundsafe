# FS-ISS-002: sfx-pack-manifest Ed25519 verification

**Priority:** High
**Status:** QUEUE
**QA:** PENDING
**Created:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.1)
**Assigned To:** Fullstack-Dev

## Description

Implement real Ed25519 signature verification in `sfx-pack-manifest`. Public function returns a parsed `Manifest` only after the detached signature verifies against the bundled publisher public key. Tests use the `hello_pack` fixture from FS-ISS-001 for both positive and negative scenarios.

Per ADR-006 and `sound-delivery.md §2`, the signature must be verified before any value inside the manifest is trusted — including auth tags and nonces. A tampered manifest must never produce a partially-parsed `Manifest` value.

## Acceptance Criteria

- [ ] `sfx_pack_manifest::verify_and_parse(manifest_bytes: &[u8], signature_bytes: &[u8], public_key: &[u8; 32]) -> Result<Manifest, ManifestError>` exists.
- [ ] `ManifestError` enum covers at least: `SignatureFailed`, `BadSignatureFormat`, `BadPublicKeyFormat`, `Parse(serde_json::Error)`.
- [ ] Signature verification happens **before** `serde_json::from_slice` parses the body. Implementation must call `ed25519-dalek` first, return early on failure, and only then parse.
- [ ] Positive test using `sfx_test_fixtures::hello_pack(0)`: returns `Ok(manifest)` and `manifest.pack_id == "hello"` (or whatever the fixture sets).
- [ ] Negative tests using the same fixture with mutations:
  - Flipped bit anywhere in `manifest_bytes` → `Err(SignatureFailed)`.
  - Truncated `signature_bytes` (cut to 60 bytes) → `Err(BadSignatureFormat)` or `Err(SignatureFailed)`.
  - Wrong public key (different fixture seed) → `Err(SignatureFailed)`.
- [ ] No allocation of a `Manifest` value on the failure path (verify before parse means we never construct one).
- [ ] Existing `Manifest` round-trip tests in `sfx-pack-manifest/src/lib.rs` continue to pass — this is additive, not a rewrite.

## Notes

- `ed25519-dalek` is already in workspace dependencies. No new crates needed.
- The bundled publisher public key in production will live somewhere in `rust-core`'s init path (see ADR-006); for M1.1 the test passes the key explicitly. The wiring of "what key is bundled with the client" is a M1.6 concern.
- This is a pure function; no I/O. All test inputs come from the fixture in M1.0.

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`cargo check --workspace`)
- [ ] Unit tests passed (`cargo nextest run -p sfx-pack-manifest`)
- [ ] Integration tests passed (covered by the negative-tests above)
- [ ] UAT tests passed (n/a — no user-facing behavior)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
