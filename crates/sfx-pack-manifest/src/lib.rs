//! Soundsafe pack manifest — types, parsing, signature verification.
//!
//! Mirrors the manifest JSON shape documented in `sound-delivery.md §2`.
//! The public verification entry point is [`verify_and_parse`], which
//! checks an Ed25519 detached signature **before** parsing the manifest
//! body. Tampered inputs never produce a partially-parsed [`Manifest`]
//! — this is load-bearing per ADR-006 ("verify the manifest signature
//! before trusting any value from inside the manifest").
//!
//! The `therapist` field on [`Manifest`] is reserved (ADR-004) for
//! plugin-authored content and round-trips through serde without v1 code
//! reading it.

extern crate alloc;

use alloc::{string::String, vec::Vec};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

/// Required tier to play a pack. Mirrors the consumer-side tier ladder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "emit-schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum TierRequired {
    Free,
    Relaxation,
    Interactive,
}

/// One audio file inside a pack. All bytes are base64 in the on-wire JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "emit-schema", derive(schemars::JsonSchema))]
pub struct PackFile {
    /// Path inside the pack (e.g. "audio/01-chewing.opus.enc").
    pub path: String,
    /// AES-GCM nonce (12 bytes), base64.
    pub nonce: String,
    /// AES-GCM auth tag (16 bytes), base64.
    pub tag: String,
    /// SHA-256 of the *ciphertext*, base64.
    pub sha256: String,
    /// Duration of the decoded audio in milliseconds.
    pub duration_ms: u32,
    /// Human-readable label (used in the library UI).
    pub label: String,
}

/// A pre-built roadmap shipped with the pack (Tier-2 curated content).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "emit-schema", derive(schemars::JsonSchema))]
pub struct PackRoadmap {
    pub id: String,
    /// Roadmap step list — typed in `sfx-roadmap-engine` once the engine lands.
    /// For M0 we keep this as a JSON value to avoid coupling.
    pub steps: serde_json::Value,
}

/// Top-level pack manifest.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "emit-schema", derive(schemars::JsonSchema))]
pub struct Manifest {
    pub pack_id: String,
    pub version: String,
    pub min_app_version: String,
    pub tier_required: TierRequired,
    pub files: Vec<PackFile>,
    #[serde(default)]
    pub roadmaps: Vec<PackRoadmap>,
    #[serde(default)]
    pub content_warnings: Vec<String>,

    /// Reserved for therapist-plugin-authored content (ADR-004). v1 ignores
    /// this field but round-trips it through serde so plugin packs survive
    /// being touched by v1 tooling.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub therapist: Option<serde_json::Value>,
}

// ----------------------------------------------------------------------
// Verification
// ----------------------------------------------------------------------

/// Errors produced by [`verify_and_parse`].
///
/// Distinct variants for each failure class so callers can distinguish
/// "this isn't even shaped like a manifest" from "this *is* shaped like a
/// manifest but the signature doesn't verify" — useful for logging and
/// for differentiating client-side bugs from active tampering.
#[derive(Debug)]
pub enum ManifestError {
    /// The supplied 32 bytes are not a valid Ed25519 verification key
    /// (e.g. low-order point). The publisher key bundled with the client
    /// should never produce this — if it does, the bundled key is broken.
    BadPublicKeyFormat,
    /// The supplied signature bytes are not a well-formed 64-byte
    /// Ed25519 signature.
    BadSignatureFormat,
    /// The signature did not verify against the supplied public key over
    /// the supplied manifest bytes. The manifest, the signature, or the
    /// key has been tampered with — or the publisher key has rotated and
    /// the client is verifying against a stale key.
    SignatureFailed,
    /// The manifest bytes verified, but `serde_json` could not parse them.
    /// This indicates a publisher-side bug or corruption that survived
    /// the signature check, which should be impossible if the publisher
    /// signs only well-formed JSON.
    Parse(serde_json::Error),
}

impl core::fmt::Display for ManifestError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::BadPublicKeyFormat => f.write_str("bad Ed25519 public key format"),
            Self::BadSignatureFormat => f.write_str("bad Ed25519 signature format"),
            Self::SignatureFailed => f.write_str("Ed25519 signature verification failed"),
            Self::Parse(_) => f.write_str("manifest JSON parse failed after signature verified"),
        }
    }
}

impl std::error::Error for ManifestError {}

impl From<serde_json::Error> for ManifestError {
    fn from(err: serde_json::Error) -> Self {
        Self::Parse(err)
    }
}

/// Verify the Ed25519 detached signature over `manifest_bytes` and, on
/// success, parse the manifest body.
///
/// **Order is load-bearing:** the signature is verified first; only on
/// success do we hand the bytes to `serde_json`. A tampered manifest
/// never produces a partially-parsed [`Manifest`] value (ADR-006).
///
/// # Arguments
///
/// - `manifest_bytes`: the exact bytes the publisher signed. The verifier
///   must NOT re-serialize — round-trip through `serde` would change the
///   bytes (whitespace, key order) and break verification.
/// - `signature_bytes`: 64-byte Ed25519 detached signature. Other lengths
///   are rejected with [`ManifestError::BadSignatureFormat`].
/// - `public_key`: 32-byte Ed25519 verification key. The bundled
///   publisher key (eventually delivered via the client init path).
///
/// # Errors
///
/// See [`ManifestError`].
pub fn verify_and_parse(
    manifest_bytes: &[u8],
    signature_bytes: &[u8],
    public_key: &[u8; 32],
) -> Result<Manifest, ManifestError> {
    // Step 1: parse the public key. Returns Err for low-order points etc.
    let verifying_key =
        VerifyingKey::from_bytes(public_key).map_err(|_| ManifestError::BadPublicKeyFormat)?;

    // Step 2: parse the signature. Ed25519 sigs are always 64 bytes.
    let signature = Signature::from_slice(signature_bytes)
        .map_err(|_| ManifestError::BadSignatureFormat)?;

    // Step 3: verify. ed25519-dalek 2.x's `verify` is strict by default.
    verifying_key
        .verify(manifest_bytes, &signature)
        .map_err(|_| ManifestError::SignatureFailed)?;

    // Step 4: only now parse the manifest body.
    let manifest: Manifest = serde_json::from_slice(manifest_bytes)?;
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_round_trips() {
        let m = Manifest {
            pack_id: "starter".into(),
            version: "2026-04-20.1".into(),
            min_app_version: "0.1.0".into(),
            tier_required: TierRequired::Free,
            files: alloc::vec![PackFile {
                path: "audio/01-dog-bark.opus.enc".into(),
                nonce: "AAAAAAAAAAAAAAAA".into(),
                tag: "BBBBBBBBBBBBBBBBBBBBBB==".into(),
                sha256: "Y29udGVudC1zaGEyNTYtcGxhY2Vob2xkZXItYmFzZTY0".into(),
                duration_ms: 4500,
                label: "Dog bark — baseline".into(),
            }],
            roadmaps: alloc::vec![],
            content_warnings: alloc::vec![],
            therapist: None,
        };
        let json = serde_json::to_string(&m).unwrap();
        let m2: Manifest = serde_json::from_str(&json).unwrap();
        assert_eq!(m.pack_id, m2.pack_id);
        assert_eq!(m.tier_required, m2.tier_required);
        assert_eq!(m.files.len(), m2.files.len());
    }

    #[test]
    fn therapist_field_round_trips_through_v1() {
        // A plugin-authored manifest carries a `therapist` field. v1 must
        // not strip it on serialize; the plugin relies on round-trip.
        let json = r#"{
            "pack_id": "future-pack",
            "version": "1.0",
            "min_app_version": "0.1.0",
            "tier_required": "interactive",
            "files": [],
            "therapist": { "assignment_class": "test", "extra": [1, 2, 3] }
        }"#;
        let m: Manifest = serde_json::from_str(json).unwrap();
        assert!(m.therapist.is_some());
        let out = serde_json::to_string(&m).unwrap();
        assert!(out.contains("assignment_class"));
    }
}

#[cfg(test)]
mod verify_and_parse_tests {
    use super::*;
    use sfx_test_fixtures::hello_pack;

    #[test]
    fn positive_verifies_and_parses_clean_fixture() {
        let pack = hello_pack(0);
        let manifest = verify_and_parse(
            &pack.manifest_bytes,
            &pack.signature_bytes,
            &pack.public_key,
        )
        .expect("clean fixture must verify and parse");
        assert_eq!(manifest.pack_id, "hello");
        assert_eq!(manifest.tier_required, TierRequired::Free);
        assert_eq!(manifest.files.len(), 1);
    }

    #[test]
    fn flipped_bit_in_manifest_fails_signature() {
        let pack = hello_pack(0);
        let mut tampered = pack.manifest_bytes.clone();
        tampered[10] ^= 0x01; // flip a bit deep enough to be inside the JSON body
        let err = verify_and_parse(&tampered, &pack.signature_bytes, &pack.public_key)
            .expect_err("tampered manifest must fail verification");
        assert!(
            matches!(err, ManifestError::SignatureFailed),
            "expected SignatureFailed, got {:?}",
            err
        );
    }

    #[test]
    fn truncated_signature_rejected_as_bad_format() {
        let pack = hello_pack(0);
        let truncated = &pack.signature_bytes[..60]; // Ed25519 sigs are 64 bytes
        let err = verify_and_parse(&pack.manifest_bytes, truncated, &pack.public_key)
            .expect_err("truncated signature must be rejected");
        assert!(
            matches!(err, ManifestError::BadSignatureFormat),
            "expected BadSignatureFormat, got {:?}",
            err
        );
    }

    #[test]
    fn wrong_public_key_fails_verification() {
        let pack = hello_pack(0);
        let other = hello_pack(1); // independent crypto material
        let err = verify_and_parse(
            &pack.manifest_bytes,
            &pack.signature_bytes,
            &other.public_key,
        )
        .expect_err("verification against wrong key must fail");
        assert!(
            matches!(err, ManifestError::SignatureFailed),
            "expected SignatureFailed, got {:?}",
            err
        );
    }

    #[test]
    fn signature_check_runs_before_parse() {
        // Even with non-JSON bytes, we must reach the SignatureFailed
        // path — never a Parse error — because the signature check is
        // the first thing we do. This is the load-bearing invariant.
        let pack = hello_pack(0);
        let bogus = b"this is not even json".to_vec();
        let err = verify_and_parse(&bogus, &pack.signature_bytes, &pack.public_key)
            .expect_err("bogus bytes must fail at signature, not parse");
        assert!(
            matches!(err, ManifestError::SignatureFailed),
            "expected SignatureFailed (signature checked before parse), got {:?}",
            err
        );
    }

    #[test]
    fn bogus_public_key_is_rejected() {
        // A bogus public key must never verify. ed25519-dalek's
        // `VerifyingKey::from_bytes` accepts many byte patterns as
        // syntactically valid (the all-zero pattern being one of them —
        // it parses, but no legitimate signer produces it), so the
        // failure surfaces as `SignatureFailed` rather than
        // `BadPublicKeyFormat`. Both outcomes are acceptable — what
        // matters is that verify_and_parse does NOT return Ok with a
        // wrong key.
        //
        // We don't attempt to construct a key that ed25519-dalek itself
        // rejects at parse time (that would require knowing the exact
        // invalid-encoding set, which varies by library version). The
        // contract we care about is the outward-visible one: wrong key
        // → error of some kind, never a partially-parsed Manifest.
        let pack = hello_pack(0);
        let zero_key = [0u8; 32];
        let err = verify_and_parse(&pack.manifest_bytes, &pack.signature_bytes, &zero_key)
            .expect_err("all-zero key must not verify");
        assert!(
            matches!(
                err,
                ManifestError::BadPublicKeyFormat | ManifestError::SignatureFailed
            ),
            "expected BadPublicKeyFormat or SignatureFailed, got {:?}",
            err
        );
    }
}
