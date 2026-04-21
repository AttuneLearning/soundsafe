# FS-ISS-001: Hello-pack test fixture

**Priority:** High
**Status:** ACTIVE
**QA:** PENDING
**Created:** 2026-04-20
**Started:** 2026-04-20
**Requested By:** Fullstack-Dev (per m1-phases.md M1.0)
**Assigned To:** Fullstack-Dev

## Description

Create a `crates/sfx-test-fixtures` crate (dev-only, `publish = false`) that produces a deterministic in-memory "hello pack": one synthetic audio file, AES-256-GCM encrypted with a known random key + nonce, an Ed25519-signed manifest, bundled into a `HelloPack` value. Used by M1.1 (`sfx-pack-manifest` verify) and M1.2 (`sfx-pack-vault` decrypt) tests.

All crypto is real (`aes-gcm`, `ed25519-dalek`). No placeholder bytes — the fixture must be decryptable and verifiable by real implementations downstream.

## Acceptance Criteria

- [x] `crates/sfx-test-fixtures/` exists with `Cargo.toml` (`publish = false`) and is added to the root workspace.
- [x] `sfx_test_fixtures::hello_pack(seed: u64) -> HelloPack` returns a `HelloPack` containing:
  - `manifest_bytes: Vec<u8>` — serialized `Manifest` JSON.
  - `signature_bytes: [u8; 64]` — Ed25519 detached signature over `manifest_bytes` (typed as fixed-size array — Ed25519 sigs are always 64 bytes; tighter than `Vec<u8>`).
  - `public_key: [u8; 32]` — Ed25519 public verification key.
  - `pack_key: [u8; 32]` — AES-256-GCM key.
  - `encrypted_files: Vec<EncryptedFile>` where each `EncryptedFile` has `path: String`, `ciphertext: Vec<u8>`, `nonce: [u8; 12]`, `tag: [u8; 16]`, `plaintext_len: usize`, `plaintext: Vec<u8>` (added so tests can verify decrypt round-trip).
- [x] Determinism: the same `seed` produces bit-identical output across runs (`ChaCha20Rng::seed_from_u64`).
- [x] Smoke test in the fixture crate proves:
  - The produced manifest parses as `sfx_pack_manifest::Manifest` via `serde_json`.
  - The encrypted file decrypts back to its original plaintext via `aes-gcm` directly (round-trip works without depending on `sfx-pack-vault` yet).
- [x] Synthetic audio: 4096 zero bytes (silence stand-in); manifest reports `duration_ms: 4500`.
- [x] Crate added to `Cargo.toml` workspace `members`.
- [x] No new runtime dependencies leak into production crates — `sfx-test-fixtures` is `publish = false`; downstream crates pick it up via `dev-dependencies`.

**Note on signature type:** the issue description called `signature_bytes` `Vec<u8>`. Ed25519 signatures are always exactly 64 bytes, so the implementation uses `[u8; 64]` for type safety. If a downstream consumer needs a slice, `&signature_bytes[..]` works.

## Notes

- The fixture is consumed by M1.1 (manifest verify) and M1.2 (vault decrypt). Their tests will `dev-dependencies = { sfx-test-fixtures = { path = "..." } }`.
- Determinism via `seed` lets tests use `hello_pack(0)` as a stable input. Different seeds let tests build mutated variants without reimplementing the generator.
- The pack content shape mirrors `sound-delivery.md §2`. We only populate the fields M1 needs; full conformance with `tier_required`, `roadmaps`, `content_warnings` etc. lives in the `Manifest` type and round-trips cleanly even if unused here.

## Dev Handoff to QA

- [x] Development Complete
- [x] Awaiting QA
- [ ] Typecheck passed (`cargo check --workspace`) — **deferred to QA env** (no Rust toolchain available in the dev session that produced this commit; QA must run locally)
- [ ] Unit tests passed (`cargo nextest run -p sfx-test-fixtures`) — **deferred to QA env**
- [x] Integration tests passed (n/a for fixture crate)
- [x] UAT tests passed (n/a — no user-facing behavior)

### Implementation summary

- Added `crates/sfx-test-fixtures/` (`publish = false`).
- Workspace `Cargo.toml`: added `sfx-test-fixtures` to `[workspace] members`; added `sha2`, `base64`, `rand`, `rand_chacha` to `[workspace.dependencies]` so other crates can pick them up consistently.
- All crypto is real:
  - 32-byte AES-256-GCM pack key derived from `ChaCha20Rng::seed_from_u64(seed)`.
  - 12-byte AES-GCM nonce from the same RNG.
  - Plaintext: 4096 bytes of zeros; manifest reports `duration_ms: 4500`.
  - `aes-gcm 0.10` encrypt-in-place-detached; ciphertext + 16-byte tag stored separately on `EncryptedFile`.
  - SHA-256 of the ciphertext for the manifest's `sha256` field.
  - Ed25519 signing key derived from a 32-byte seed pulled from the same RNG.
  - Detached signature over the serialized `manifest_bytes`.
- Smoke tests in the fixture crate cover:
  - Round-trip: manifest parses; ciphertext decrypts back to plaintext via `aes-gcm` directly.
  - Determinism: same seed → bit-identical output.
  - Independence: different seeds → independent crypto material (key, public key, signature, nonce, ciphertext all differ).
  - Signature verifies against the public key (using `ed25519-dalek` directly; `sfx-pack-manifest::verify_and_parse` is FS-ISS-002 work).

### Files changed

- `Cargo.toml` (workspace member + 4 new workspace deps).
- `crates/sfx-test-fixtures/Cargo.toml` (new).
- `crates/sfx-test-fixtures/src/lib.rs` (new, ~180 lines including tests).

## QA Verification Evidence

- QA Verdict:
- Coverage Assessment:
- Manual Review:
- Unblock Criteria (required if blocked):

## Completion

**Completed:**
**Notes:**
