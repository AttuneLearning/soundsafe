//! Soundsafe — test fixtures for pack handling.
//!
//! Produces a deterministic in-memory "hello pack" used by
//! `sfx-pack-manifest`, `sfx-pack-vault`, and downstream tests. All crypto
//! is real (AES-256-GCM + Ed25519); only the audio payload is synthetic
//! (a short buffer of silence — sufficient for testing the pack envelope
//! since no audio decoding is exercised here).
//!
//! The `seed` parameter to [`hello_pack`] drives all randomness via
//! ChaCha20: a given seed produces bit-identical output across runs and
//! platforms. Tests can rely on `hello_pack(0)` as a stable fixture and
//! use other seeds to construct independent variants without
//! reimplementing the generator.
//!
//! This crate is `publish = false`. It is wired in as a `dev-dependencies`
//! entry in downstream crates and never links into production builds.

use aes_gcm::{
    aead::{generic_array::GenericArray, AeadInPlace, KeyInit},
    Aes256Gcm,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use ed25519_dalek::{Signer, SigningKey};
use rand::{RngCore, SeedableRng};
use rand_chacha::ChaCha20Rng;
use sfx_pack_manifest::{Manifest, PackFile, TierRequired};
use sha2::{Digest, Sha256};

/// One encrypted file inside a hello pack.
#[derive(Debug, Clone)]
pub struct EncryptedFile {
    /// Path inside the pack — matches the corresponding entry in the manifest.
    pub path: String,
    /// AES-256-GCM ciphertext (without the auth tag appended).
    pub ciphertext: Vec<u8>,
    /// 96-bit nonce used for this file's encryption.
    pub nonce: [u8; 12],
    /// 128-bit GCM authentication tag.
    pub tag: [u8; 16],
    /// Length of the original plaintext, in bytes.
    pub plaintext_len: usize,
    /// Original plaintext — included so tests can verify decrypt round-trips.
    pub plaintext: Vec<u8>,
}

/// Bundle of everything needed to test pack manifest verification and
/// pack-vault decryption end-to-end.
#[derive(Debug, Clone)]
pub struct HelloPack {
    /// Serialized manifest JSON (the bytes a publisher signs and a client
    /// verifies).
    pub manifest_bytes: Vec<u8>,
    /// Detached Ed25519 signature over `manifest_bytes`.
    pub signature_bytes: [u8; 64],
    /// Ed25519 public verification key paired with the signing key.
    pub public_key: [u8; 32],
    /// AES-256-GCM key for decrypting `encrypted_files`.
    pub pack_key: [u8; 32],
    /// One or more encrypted files; the hello pack ships exactly one.
    pub encrypted_files: Vec<EncryptedFile>,
}

/// Build a deterministic hello pack from `seed`.
///
/// Same `seed` → bit-identical output. Different seeds produce
/// independent packs (different keys, different nonces, different
/// signatures) without sharing any cryptographic material.
pub fn hello_pack(seed: u64) -> HelloPack {
    let mut rng = ChaCha20Rng::seed_from_u64(seed);

    // Pack key (AES-256-GCM, 32 bytes).
    let mut pack_key = [0u8; 32];
    rng.fill_bytes(&mut pack_key);

    // Ed25519 signing key — derived from a fresh 32-byte seed pulled from
    // the same RNG so determinism flows through both crypto subsystems.
    let mut signing_seed = [0u8; 32];
    rng.fill_bytes(&mut signing_seed);
    let signing_key = SigningKey::from_bytes(&signing_seed);
    let public_key: [u8; 32] = signing_key.verifying_key().to_bytes();

    // Per-file nonce.
    let mut nonce = [0u8; 12];
    rng.fill_bytes(&mut nonce);

    // Synthetic audio: 4096 zero bytes (silence stand-in). The duration in
    // the manifest is metadata only; we do not exercise audio decoding here.
    let plaintext = vec![0u8; 4096];

    // AES-GCM encrypt in place + detached tag.
    let cipher = Aes256Gcm::new(GenericArray::from_slice(&pack_key));
    let mut buffer = plaintext.clone();
    let tag = cipher
        .encrypt_in_place_detached(GenericArray::from_slice(&nonce), b"", &mut buffer)
        .expect("AES-GCM encryption is infallible for valid key/nonce sizes");
    let tag_bytes: [u8; 16] = tag.into();
    let ciphertext = buffer;

    // SHA-256 of the ciphertext for the manifest's integrity-before-decrypt
    // entry.
    let mut hasher = Sha256::new();
    hasher.update(&ciphertext);
    let sha256_hash = hasher.finalize();

    // Build the manifest. Field shapes mirror sound-delivery.md §2.
    let manifest = Manifest {
        pack_id: "hello".to_string(),
        version: "2026-04-20.1".to_string(),
        min_app_version: "0.1.0".to_string(),
        tier_required: TierRequired::Free,
        files: vec![PackFile {
            path: "audio/00-silence.opus.enc".to_string(),
            nonce: B64.encode(nonce),
            tag: B64.encode(tag_bytes),
            sha256: B64.encode(sha256_hash),
            duration_ms: 4500,
            label: "Silence (test fixture)".to_string(),
        }],
        roadmaps: vec![],
        content_warnings: vec![],
        therapist: None,
    };

    // serde_json::to_vec produces a compact JSON without trailing newlines.
    // The publisher signs exactly these bytes; the verifier must verify
    // exactly these bytes. No re-serialization between the two.
    let manifest_bytes = serde_json::to_vec(&manifest).expect("manifest must serialize");

    // Sign the serialized manifest.
    let signature = signing_key.sign(&manifest_bytes);
    let signature_bytes: [u8; 64] = signature.to_bytes();

    HelloPack {
        manifest_bytes,
        signature_bytes,
        public_key,
        pack_key,
        encrypted_files: vec![EncryptedFile {
            path: "audio/00-silence.opus.enc".to_string(),
            ciphertext,
            nonce,
            tag: tag_bytes,
            plaintext_len: plaintext.len(),
            plaintext,
        }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke: the produced pack round-trips through the real crypto stack
    /// without going through `sfx-pack-manifest::verify_and_parse` or
    /// `sfx-pack-vault::decrypt_into` (those are M1.1 and M1.2 work).
    /// We use `aes-gcm` and `serde_json` directly so this test is self-
    /// contained and does not depend on code that does not exist yet.
    #[test]
    fn smoke_round_trip_via_raw_crypto() {
        let pack = hello_pack(0);

        // Manifest parses cleanly.
        let parsed: Manifest = serde_json::from_slice(&pack.manifest_bytes).unwrap();
        assert_eq!(parsed.pack_id, "hello");
        assert_eq!(parsed.tier_required, TierRequired::Free);
        assert_eq!(parsed.files.len(), 1);
        assert_eq!(parsed.files[0].path, "audio/00-silence.opus.enc");
        assert_eq!(parsed.files[0].duration_ms, 4500);

        // Encrypted file decrypts back to the original plaintext.
        let cipher = Aes256Gcm::new(GenericArray::from_slice(&pack.pack_key));
        let ef = &pack.encrypted_files[0];
        let mut buffer = ef.ciphertext.clone();
        cipher
            .decrypt_in_place_detached(
                GenericArray::from_slice(&ef.nonce),
                b"",
                &mut buffer,
                GenericArray::from_slice(&ef.tag),
            )
            .expect("decrypt with the pack's own key/nonce/tag must succeed");
        assert_eq!(buffer, ef.plaintext);
        assert_eq!(buffer.len(), ef.plaintext_len);
    }

    /// Determinism: same seed → bit-identical output.
    #[test]
    fn deterministic_across_runs_with_same_seed() {
        let a = hello_pack(0);
        let b = hello_pack(0);
        assert_eq!(a.manifest_bytes, b.manifest_bytes);
        assert_eq!(a.signature_bytes, b.signature_bytes);
        assert_eq!(a.public_key, b.public_key);
        assert_eq!(a.pack_key, b.pack_key);
        assert_eq!(a.encrypted_files.len(), b.encrypted_files.len());
        let (a0, b0) = (&a.encrypted_files[0], &b.encrypted_files[0]);
        assert_eq!(a0.ciphertext, b0.ciphertext);
        assert_eq!(a0.nonce, b0.nonce);
        assert_eq!(a0.tag, b0.tag);
    }

    /// Different seeds produce independent crypto material — no shared key,
    /// no shared signature, no shared nonce.
    #[test]
    fn different_seeds_produce_independent_packs() {
        let a = hello_pack(0);
        let b = hello_pack(1);
        assert_ne!(a.pack_key, b.pack_key);
        assert_ne!(a.public_key, b.public_key);
        assert_ne!(a.signature_bytes, b.signature_bytes);
        assert_ne!(a.encrypted_files[0].nonce, b.encrypted_files[0].nonce);
        assert_ne!(a.encrypted_files[0].ciphertext, b.encrypted_files[0].ciphertext);
    }

    /// The public key is the verification half of the signing key — the
    /// signature must verify against it (using `ed25519-dalek` directly,
    /// before `sfx-pack-manifest::verify_and_parse` exists).
    #[test]
    fn signature_verifies_against_public_key() {
        use ed25519_dalek::{Signature, Verifier, VerifyingKey};
        let pack = hello_pack(0);
        let vk = VerifyingKey::from_bytes(&pack.public_key).unwrap();
        let sig = Signature::from_bytes(&pack.signature_bytes);
        vk.verify(&pack.manifest_bytes, &sig)
            .expect("fixture signature must verify against fixture public key");
    }
}
