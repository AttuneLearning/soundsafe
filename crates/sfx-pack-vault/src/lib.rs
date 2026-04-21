//! Soundsafe pack vault — AES-256-GCM decryption and key lifecycle.
//!
//! Per ADR-010: the pack key is held only in WASM linear memory inside a
//! [`Zeroizing<[u8; 32]>`](zeroize::Zeroizing) wrapper and is zeroed on
//! `Drop` (i.e. on pack unload, when the [`PackVault`] is dropped).
//!
//! The decryption path is **streaming**: plaintext is written into a
//! caller-supplied buffer, never returned as a fresh allocation in the hot
//! path. The GCM authentication tag is verified **before** any plaintext
//! byte is committed; on tag failure the output buffer is zeroed so a
//! buggy caller that ignores the error cannot read partial plaintext.

use aes_gcm::{
    aead::{generic_array::GenericArray, AeadInPlace, KeyInit},
    Aes256Gcm,
};
use zeroize::Zeroizing;

/// AES-GCM nonce length in bytes (96 bits).
const NONCE_LEN: usize = 12;
/// AES-GCM authentication-tag length in bytes (128 bits).
const TAG_LEN: usize = 16;

/// Errors produced by [`PackVault::decrypt_into`].
#[derive(Debug)]
pub enum VaultError {
    /// Supplied nonce was not exactly 12 bytes.
    BadNonceLength,
    /// Supplied authentication tag was not exactly 16 bytes.
    BadTagLength,
    /// Output buffer is smaller than the ciphertext.
    OutBufferTooSmall { needed: usize, got: usize },
    /// Authentication tag verification failed. The ciphertext, nonce, key,
    /// or tag has been tampered with — or the wrong key was supplied for
    /// this ciphertext. The output buffer has been zeroed for the
    /// ciphertext-length range.
    TagMismatch,
}

impl core::fmt::Display for VaultError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::BadNonceLength => f.write_str("AES-GCM nonce must be exactly 12 bytes"),
            Self::BadTagLength => f.write_str("AES-GCM tag must be exactly 16 bytes"),
            Self::OutBufferTooSmall { needed, got } => {
                write!(f, "out buffer too small: needed {needed}, got {got}")
            }
            Self::TagMismatch => {
                f.write_str("AES-GCM authentication tag verification failed")
            }
        }
    }
}

impl std::error::Error for VaultError {}

/// AES-256-GCM pack vault.
///
/// Holds the pack key in a [`Zeroizing<[u8; 32]>`](zeroize::Zeroizing) so
/// the bytes are overwritten on `Drop` per ADR-010. Construction takes
/// ownership of the key array — callers should not retain a copy.
///
/// `decrypt_into` writes plaintext into a caller-supplied buffer; the
/// hot path does not allocate.
pub struct PackVault {
    key: Zeroizing<[u8; 32]>,
}

impl PackVault {
    /// Construct a vault from a 32-byte AES-256-GCM key. The key is moved
    /// into the vault and held under [`Zeroizing`](zeroize::Zeroizing);
    /// the original byte array is overwritten on `Drop`.
    pub fn new(pack_key: [u8; 32]) -> Self {
        Self {
            key: Zeroizing::new(pack_key),
        }
    }

    /// Decrypt `ciphertext` (using the supplied 12-byte `nonce` and
    /// 16-byte `tag`) into `out_buf`.
    ///
    /// The GCM authentication tag is verified before any plaintext byte
    /// is committed. On `Ok(n)`, `out_buf[..n]` holds plaintext and `n`
    /// equals `ciphertext.len()`. On `Err(TagMismatch)`, `out_buf` is
    /// zeroed in the `[..ciphertext.len()]` range.
    ///
    /// The decryption is in-place inside `out_buf` — `ciphertext` is
    /// copied in, then `aes-gcm`'s `decrypt_in_place_detached` rewrites
    /// the buffer with plaintext on success.
    pub fn decrypt_into(
        &self,
        ciphertext: &[u8],
        nonce: &[u8],
        tag: &[u8],
        out_buf: &mut [u8],
    ) -> Result<usize, VaultError> {
        if nonce.len() != NONCE_LEN {
            return Err(VaultError::BadNonceLength);
        }
        if tag.len() != TAG_LEN {
            return Err(VaultError::BadTagLength);
        }
        if out_buf.len() < ciphertext.len() {
            return Err(VaultError::OutBufferTooSmall {
                needed: ciphertext.len(),
                got: out_buf.len(),
            });
        }

        // Copy ciphertext into out_buf for in-place decryption.
        out_buf[..ciphertext.len()].copy_from_slice(ciphertext);

        let cipher = Aes256Gcm::new(GenericArray::from_slice(&*self.key));
        let result = cipher.decrypt_in_place_detached(
            GenericArray::from_slice(nonce),
            b"", // associated data: empty for v1 packs
            &mut out_buf[..ciphertext.len()],
            GenericArray::from_slice(tag),
        );

        match result {
            Ok(()) => Ok(ciphertext.len()),
            Err(_) => {
                // Defense in depth: zero the output range so a buggy
                // caller that ignores the error can't observe partial
                // plaintext. The aes-gcm crate's contract leaves the
                // buffer in an unspecified state on auth failure.
                for byte in &mut out_buf[..ciphertext.len()] {
                    *byte = 0;
                }
                Err(VaultError::TagMismatch)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sfx_test_fixtures::hello_pack;

    #[test]
    fn decrypts_clean_fixture_round_trip() {
        let pack = hello_pack(0);
        let ef = &pack.encrypted_files[0];
        let vault = PackVault::new(pack.pack_key);

        let mut out = vec![0u8; ef.ciphertext.len()];
        let n = vault
            .decrypt_into(&ef.ciphertext, &ef.nonce, &ef.tag, &mut out)
            .expect("clean fixture must decrypt");

        assert_eq!(n, ef.plaintext_len);
        assert_eq!(&out[..n], ef.plaintext.as_slice());
    }

    #[test]
    fn flipped_bit_in_ciphertext_fails_tag_and_zeros_buffer() {
        let pack = hello_pack(0);
        let ef = &pack.encrypted_files[0];
        let vault = PackVault::new(pack.pack_key);

        let mut tampered = ef.ciphertext.clone();
        tampered[10] ^= 0x01;

        let mut out = vec![0xAAu8; tampered.len()]; // pre-fill with sentinel
        let err = vault
            .decrypt_into(&tampered, &ef.nonce, &ef.tag, &mut out)
            .expect_err("tampered ciphertext must fail");

        assert!(matches!(err, VaultError::TagMismatch));
        // Defense in depth: out_buf was zeroed in the ciphertext range.
        assert!(
            out[..tampered.len()].iter().all(|b| *b == 0),
            "out_buf must be zeroed on TagMismatch"
        );
    }

    #[test]
    fn wrong_nonce_fails_tag() {
        let pack = hello_pack(0);
        let ef = &pack.encrypted_files[0];
        let vault = PackVault::new(pack.pack_key);

        let mut wrong_nonce = ef.nonce;
        wrong_nonce[0] ^= 0x01;

        let mut out = vec![0u8; ef.ciphertext.len()];
        let err = vault
            .decrypt_into(&ef.ciphertext, &wrong_nonce, &ef.tag, &mut out)
            .expect_err("wrong nonce must fail");
        assert!(matches!(err, VaultError::TagMismatch));
    }

    #[test]
    fn wrong_key_fails_tag() {
        let pack = hello_pack(0);
        let other = hello_pack(1); // independent key
        let ef = &pack.encrypted_files[0];
        let vault = PackVault::new(other.pack_key);

        let mut out = vec![0u8; ef.ciphertext.len()];
        let err = vault
            .decrypt_into(&ef.ciphertext, &ef.nonce, &ef.tag, &mut out)
            .expect_err("wrong key must fail");
        assert!(matches!(err, VaultError::TagMismatch));
    }

    #[test]
    fn rejects_bad_nonce_length() {
        let pack = hello_pack(0);
        let ef = &pack.encrypted_files[0];
        let vault = PackVault::new(pack.pack_key);

        let mut out = vec![0u8; ef.ciphertext.len()];
        let err = vault
            .decrypt_into(&ef.ciphertext, &[0u8; 8], &ef.tag, &mut out)
            .expect_err("8-byte nonce must be rejected");
        assert!(matches!(err, VaultError::BadNonceLength));
    }

    #[test]
    fn rejects_bad_tag_length() {
        let pack = hello_pack(0);
        let ef = &pack.encrypted_files[0];
        let vault = PackVault::new(pack.pack_key);

        let mut out = vec![0u8; ef.ciphertext.len()];
        let err = vault
            .decrypt_into(&ef.ciphertext, &ef.nonce, &[0u8; 12], &mut out)
            .expect_err("12-byte tag must be rejected");
        assert!(matches!(err, VaultError::BadTagLength));
    }

    #[test]
    fn rejects_too_small_out_buffer() {
        let pack = hello_pack(0);
        let ef = &pack.encrypted_files[0];
        let vault = PackVault::new(pack.pack_key);

        let mut out = vec![0u8; 10]; // way too small
        let err = vault
            .decrypt_into(&ef.ciphertext, &ef.nonce, &ef.tag, &mut out)
            .expect_err("undersized buffer must be rejected");
        assert!(matches!(
            err,
            VaultError::OutBufferTooSmall { needed: _, got: 10 }
        ));
    }

    /// Drop runs the `Zeroize` impl on the key. We trust the `zeroize`
    /// crate's `Drop` impl on `Zeroizing<[u8; 32]>` to overwrite the
    /// bytes — the type system is the contract here. This test only
    /// asserts the wiring is in place (vault constructs and drops without
    /// panicking).
    #[test]
    fn vault_drops_without_panic() {
        let pack = hello_pack(0);
        let vault = PackVault::new(pack.pack_key);
        drop(vault);
    }
}
