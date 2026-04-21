# FS-ISS-001: Hello-pack test fixture

**Priority:** High
**Status:** QUEUE
**QA:** PENDING
**Created:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.0)
**Assigned To:** Fullstack-Dev

## Description

Create a `crates/sfx-test-fixtures` crate (dev-only, `publish = false`) that produces a deterministic in-memory "hello pack": one synthetic audio file, AES-256-GCM encrypted with a known random key + nonce, an Ed25519-signed manifest, bundled into a `HelloPack` value. Used by M1.1 (`sfx-pack-manifest` verify) and M1.2 (`sfx-pack-vault` decrypt) tests.

All crypto is real (`aes-gcm`, `ed25519-dalek`). No placeholder bytes — the fixture must be decryptable and verifiable by real implementations downstream.

## Acceptance Criteria

- [ ] `crates/sfx-test-fixtures/` exists with `Cargo.toml` (`publish = false`) and is added to the root workspace.
- [ ] `sfx_test_fixtures::hello_pack(seed: u64) -> HelloPack` returns a `HelloPack` containing:
  - `manifest_bytes: Vec<u8>` — serialized `Manifest` JSON.
  - `signature_bytes: Vec<u8>` — Ed25519 detached signature over `manifest_bytes`.
  - `public_key: [u8; 32]` — Ed25519 public verification key.
  - `pack_key: [u8; 32]` — AES-256-GCM key.
  - `encrypted_files: Vec<EncryptedFile>` where each `EncryptedFile` has `path: String`, `ciphertext: Vec<u8>`, `nonce: [u8; 12]`, `tag: [u8; 16]`, `plaintext_len: usize`.
- [ ] Determinism: the same `seed` produces bit-identical output across runs.
- [ ] Smoke test in the fixture crate proves:
  - The produced manifest parses as `sfx_pack_manifest::Manifest` via `serde_json`.
  - The encrypted file decrypts back to its original plaintext via `aes-gcm` directly (round-trip works without depending on `sfx-pack-vault` yet).
- [ ] Synthetic audio: a 4500 ms-equivalent chunk of zero bytes (silence stand-in) is sufficient — real Opus is not needed for this fixture.
- [ ] Crate added to `Cargo.toml` workspace `members`.
- [ ] No new runtime dependencies leak into production crates — `sfx-test-fixtures` is dev-only.

## Notes

- The fixture is consumed by M1.1 (manifest verify) and M1.2 (vault decrypt). Their tests will `dev-dependencies = { sfx-test-fixtures = { path = "..." } }`.
- Determinism via `seed` lets tests use `hello_pack(0)` as a stable input. Different seeds let tests build mutated variants without reimplementing the generator.
- The pack content shape mirrors `sound-delivery.md §2`. We only populate the fields M1 needs; full conformance with `tier_required`, `roadmaps`, `content_warnings` etc. lives in the `Manifest` type and round-trips cleanly even if unused here.

## Dev Handoff to QA

- [ ] Development Complete
- [ ] Awaiting QA
- [ ] Typecheck passed (`cargo check --workspace`)
- [ ] Unit tests passed (`cargo nextest run -p sfx-test-fixtures`)
- [ ] Integration tests passed (n/a for fixture crate)
- [ ] UAT tests passed (n/a — no user-facing behavior)

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
