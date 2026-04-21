//! Soundsafe pack manifest — types, parsing, signature verification.
//!
//! Mirrors the manifest JSON shape documented in `sound-delivery.md §2`.
//! Ed25519 signature verification (via `ed25519-dalek`) lands in M1.
//!
//! The `therapist` field is reserved (ADR-004) for plugin-authored content
//! and round-trips through serde without v1 code reading it.

#![cfg_attr(not(any(test, feature = "emit-schema")), no_std)]

extern crate alloc;

use alloc::{string::String, vec::Vec};
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
