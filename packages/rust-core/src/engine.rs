//! Internal engine state shared across the wasm-bindgen entry points.
//!
//! The wasm-bindgen functions in [`crate`](../index.html) are thin
//! adapters around [`Engine`]. `Engine` holds an `AudioGraph`
//! (required `SafetyRails` per ADR-015), a `RoadmapRunner` driven by
//! `SampleCounterClock`, and optionally a `PackVault` once the user
//! has selected a pack.
//!
//! Exposing `Engine` as a regular Rust type lets us cover the boundary
//! with plain `cargo nextest` tests — `wasm-pack test` is reserved for
//! what can only run in a browser/node-WASM runtime (see
//! `tests/sanity.rs`).

use alloc::boxed::Box;
use alloc::string::{String, ToString};
use alloc::vec::Vec;
use core::fmt;

use sfx_audio_graph::{AudioGraph, AudioGraphConfig, ParamMessage, RingFull};
use sfx_dsp::transforms::gain::Gain;
use sfx_dsp::Transform;
use sfx_pack_manifest::{verify_and_parse, Manifest, ManifestError};
use sfx_pack_vault::{PackVault, VaultError};
use sfx_roadmap_engine::{
    AdvanceCondition, Roadmap, RoadmapEvent, RoadmapRunner, RunnerInput,
    SampleCounterClock, SafetyBlock, Step, TransformSpec,
};
use sfx_safety::SafetyRails;
use serde::{Deserialize, Serialize};

/// Outward-visible error. The wasm-bindgen surface wraps this in a
/// `JsError` / `JsValue`; internal tests read it directly.
#[derive(Debug)]
pub enum EngineError {
    /// `load_pack_manifest` was called before `init`.
    NotInitialized,
    /// No pack key is installed; `decrypt_file` / `play_pack` need one.
    NoPackKey,
    /// No pack manifest is installed; `play_pack` needs one.
    NoPack,
    /// Pack-key buffer was not exactly 32 bytes.
    BadPackKeyLength,
    /// Bundled-public-key buffer was not exactly 32 bytes.
    BadPublicKeyLength,
    /// Signature from the publisher did not validate.
    Manifest(ManifestError),
    /// AES-GCM decrypt failed.
    Vault(VaultError),
    /// JSON describing a step or roadmap was malformed.
    Json(String),
    /// The parameter ring was full; caller must retry later.
    RingFull,
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotInitialized => f.write_str("engine not initialized; call engineInit first"),
            Self::NoPackKey => f.write_str("no pack key installed"),
            Self::NoPack => f.write_str("no pack manifest installed"),
            Self::BadPackKeyLength => f.write_str("pack key must be exactly 32 bytes"),
            Self::BadPublicKeyLength => f.write_str("public key must be exactly 32 bytes"),
            Self::Manifest(e) => write!(f, "manifest: {e}"),
            Self::Vault(e) => write!(f, "vault: {e}"),
            Self::Json(e) => write!(f, "json: {e}"),
            Self::RingFull => f.write_str("param ring is full"),
        }
    }
}

impl std::error::Error for EngineError {}

impl From<ManifestError> for EngineError {
    fn from(e: ManifestError) -> Self { Self::Manifest(e) }
}
impl From<VaultError> for EngineError {
    fn from(e: VaultError) -> Self { Self::Vault(e) }
}
impl From<serde_json::Error> for EngineError {
    fn from(e: serde_json::Error) -> Self { Self::Json(e.to_string()) }
}
impl From<RingFull> for EngineError {
    fn from(_: RingFull) -> Self { Self::RingFull }
}

/// Wire-format step: what `play_step` accepts as a JSON body. Aligns
/// with `sfx_roadmap_engine::Step` but keeps JSON-friendly field names.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepDto {
    pub source_id: String,
    #[serde(default)]
    pub transforms: Vec<TransformSpecDto>,
    pub duration_ms: u32,
    pub advance_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransformSpecDto {
    pub kind: String,
    #[serde(default)]
    pub params: Vec<ParamPairDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParamPairDto {
    pub id: u16,
    pub value: f32,
}

/// Wire-format roadmap: what `load_roadmap` / `loadRoadmap` accepts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoadmapDto {
    pub id: String,
    #[serde(default)]
    pub steps: Vec<StepDto>,
}

/// Single encrypted pack file, base64-encoded for JSON transport.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedFileDto {
    pub path: String,
    pub ciphertext_b64: String,
    pub nonce_b64: String,
    pub tag_b64: String,
}

/// Decrypted pack file, base64-encoded plaintext in the response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecryptedFileDto {
    pub path: String,
    pub plaintext_len: usize,
    pub plaintext_b64: String,
}

fn base64_decode(s: &str) -> Result<Vec<u8>, EngineError> {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|e| EngineError::Json(alloc::format!("base64: {e}")))
}

fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

impl From<StepDto> for Step {
    fn from(d: StepDto) -> Self {
        Self {
            source_id: d.source_id,
            transforms: d
                .transforms
                .into_iter()
                .map(|t| TransformSpec {
                    kind: t.kind,
                    params: t.params.into_iter().map(|p| (p.id, p.value)).collect(),
                })
                .collect(),
            duration_ms: d.duration_ms,
            advance: AdvanceCondition::Timer { ms: d.advance_ms },
        }
    }
}

/// The wasm-side engine singleton.
pub struct Engine {
    config: AudioGraphConfig,
    graph: AudioGraph,
    runner: RoadmapRunner<SampleCounterClock>,
    bundled_public_key: [u8; 32],
    vault: Option<PackVault>,
    manifest: Option<Manifest>,
    panic_requested: bool,
    last_peak: f32,
    /// Plaintext buffer filled by `load_pack` and drained by
    /// `take_decrypted_file()`. The caller (decrypt worker on the
    /// JS side) owns OPFS I/O — rust-core only produces the bytes.
    decrypted_files: Vec<DecryptedFileDto>,
}

impl Engine {
    pub fn new(
        sample_rate: u32,
        block_size: u32,
        bundled_public_key: &[u8],
    ) -> Result<Self, EngineError> {
        if bundled_public_key.len() != 32 {
            return Err(EngineError::BadPublicKeyLength);
        }
        let mut pk = [0u8; 32];
        pk.copy_from_slice(bundled_public_key);

        let config = AudioGraphConfig {
            sample_rate,
            block_size: block_size as usize,
        };
        let rails = SafetyRails::defaults();
        let mut transforms: Vec<Box<dyn Transform>> = Vec::new();
        transforms.push(Box::new(Gain::new()));
        let graph = AudioGraph::new(config, rails, transforms);

        let runner = RoadmapRunner::new(
            Roadmap { id: String::new(), steps: Vec::new() },
            SampleCounterClock::new(),
            sample_rate,
        );

        Ok(Self {
            config,
            graph,
            runner,
            bundled_public_key: pk,
            vault: None,
            manifest: None,
            panic_requested: false,
            last_peak: 0.0,
            decrypted_files: Vec::new(),
        })
    }

    pub fn config(&self) -> AudioGraphConfig { self.config }
    pub fn has_pack(&self) -> bool { self.manifest.is_some() }
    pub fn has_pack_key(&self) -> bool { self.vault.is_some() }
    pub fn panic_latched(&self) -> bool { self.panic_requested }

    /// Verify a pack manifest against the bundled publisher key and
    /// remember the parsed `Manifest` for subsequent `decrypt_file`
    /// lookups. Returns the verified `Manifest` so callers can render
    /// it.
    pub fn load_pack_manifest(
        &mut self,
        manifest_bytes: &[u8],
        signature_bytes: &[u8],
    ) -> Result<&Manifest, EngineError> {
        let manifest = verify_and_parse(manifest_bytes, signature_bytes, &self.bundled_public_key)?;
        self.manifest = Some(manifest);
        Ok(self.manifest.as_ref().expect("just assigned"))
    }

    /// Install the pack key, building a `PackVault`. The caller's buffer
    /// is NOT touched here — the wasm-bindgen wrapper is responsible
    /// for zeroing the JS-side `Uint8Array` immediately after this
    /// returns (per ADR-010).
    pub fn install_pack_key(&mut self, pack_key_bytes: &[u8]) -> Result<(), EngineError> {
        if pack_key_bytes.len() != 32 {
            return Err(EngineError::BadPackKeyLength);
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(pack_key_bytes);
        self.vault = Some(PackVault::new(key));
        Ok(())
    }

    /// Drop the pack vault. Equivalent to `vault = None`, which
    /// `Zeroizing` handles by zeroing the key bytes.
    pub fn clear_pack_key(&mut self) {
        self.vault = None;
    }

    /// Decrypt a single pack file using the installed vault.
    pub fn decrypt_file(
        &self,
        ciphertext: &[u8],
        nonce: &[u8],
        tag: &[u8],
    ) -> Result<Vec<u8>, EngineError> {
        let vault = self.vault.as_ref().ok_or(EngineError::NoPackKey)?;
        let mut out = vec![0u8; ciphertext.len()];
        let n = vault.decrypt_into(ciphertext, nonce, tag, &mut out)?;
        out.truncate(n);
        Ok(out)
    }

    /// Replace the runner's roadmap with a single step parsed from
    /// JSON. Equivalent to "play this step next".
    pub fn play_step(&mut self, step_json: &str) -> Result<(), EngineError> {
        let dto: StepDto = serde_json::from_str(step_json)?;
        let step: Step = dto.into();
        let roadmap = Roadmap { id: "ad-hoc".to_string(), steps: vec![step] };
        self.runner = RoadmapRunner::new(roadmap, SampleCounterClock::new(), self.config.sample_rate);
        self.runner.tick();
        Ok(())
    }

    /// Replace the runner's roadmap with a multi-step roadmap parsed
    /// from JSON. The JSON shape is `{ id: string, steps: StepDto[] }`.
    pub fn load_roadmap(&mut self, roadmap_json: &str) -> Result<(), EngineError> {
        let dto: RoadmapDto = serde_json::from_str(roadmap_json)?;
        let roadmap = Roadmap {
            id: dto.id,
            steps: dto.steps.into_iter().map(Into::into).collect(),
        };
        self.runner = RoadmapRunner::new(roadmap, SampleCounterClock::new(), self.config.sample_rate);
        self.runner.tick();
        Ok(())
    }

    /// Set a parameter on a transform via the audio graph's SPSC ring.
    pub fn set_param(
        &self,
        node_id: u16,
        param_id: u16,
        value: f32,
        smoothing_ms: u16,
    ) -> Result<(), EngineError> {
        self.graph
            .enqueue_param(ParamMessage::new(node_id, param_id, value, smoothing_ms))
            .map_err(Into::into)
    }

    /// Latch a panic-stop. Idempotent; subsequent calls are no-ops.
    pub fn panic_stop(&mut self) {
        if !self.panic_requested {
            self.panic_requested = true;
            self.runner.input(RunnerInput::PanicStop);
        }
    }

    /// Forward a `SafetyBlock` into the runner.
    pub fn report_safety_block(&mut self, block: SafetyBlock) {
        self.runner.input(RunnerInput::Safety(block));
    }

    /// Pump the audio graph for one block and record the post-limiter
    /// peak (used by the TS fast-ring writer to surface a levelDb
    /// indicator). The provided input/output slices must be block-sized
    /// per `AudioGraphConfig`.
    pub fn process_block(&mut self, input: &[f32], output: &mut [f32]) {
        self.graph.process(input, output);
        // Capture peak of the fully-processed block.
        let mut peak = 0.0_f32;
        for &y in output.iter() {
            let a = if y < 0.0 { -y } else { y };
            if a > peak { peak = a; }
        }
        self.last_peak = peak;
        self.runner.clock_mut().advance(self.config.block_size as u32);
        self.runner.tick();
    }

    /// Most recent post-limiter peak amplitude (linear). Returned to
    /// the TS side as the source for the level indicator.
    pub fn last_peak(&self) -> f32 { self.last_peak }

    /// Most recent post-limiter peak in dBFS. `-inf` is surfaced as
    /// the sentinel `-120.0` to keep the wire format finite.
    pub fn last_peak_dbfs(&self) -> f32 {
        if self.last_peak <= 1e-6 { return -120.0; }
        20.0 * libm::log10f(self.last_peak)
    }

    /// Composite entry: verify manifest, install key (with zeroize),
    /// decrypt every file, emit `(path, plaintext_len)` pairs.
    pub fn load_pack(
        &mut self,
        manifest_bytes: &[u8],
        signature_bytes: &[u8],
        pack_key_bytes: &[u8],
        encrypted_files_json: &str,
    ) -> Result<(), EngineError> {
        self.load_pack_manifest(manifest_bytes, signature_bytes)?;
        self.install_pack_key(pack_key_bytes)?;
        let files: Vec<EncryptedFileDto> = serde_json::from_str(encrypted_files_json)?;
        self.decrypted_files.clear();
        let decrypt_result = (|| -> Result<(), EngineError> {
            for f in files {
                let nonce = base64_decode(&f.nonce_b64)?;
                let tag = base64_decode(&f.tag_b64)?;
                let ciphertext = base64_decode(&f.ciphertext_b64)?;
                let plaintext = self.decrypt_file(&ciphertext, &nonce, &tag)?;
                self.decrypted_files.push(DecryptedFileDto {
                    path: f.path,
                    plaintext_len: plaintext.len(),
                    plaintext_b64: base64_encode(&plaintext),
                });
            }
            Ok(())
        })();
        self.clear_pack_key();
        decrypt_result?;
        Ok(())
    }

    /// Number of decrypted files the pack loader produced. The
    /// worker drains these via `take_decrypted_file()` and writes
    /// each one to OPFS.
    pub fn decrypted_file_count(&self) -> usize { self.decrypted_files.len() }

    /// Remove and return the first queued decrypted file, or `None`
    /// if the buffer is empty. The FIFO order preserves the manifest
    /// file order so consumers can pair decrypted bytes with the
    /// original paths.
    pub fn take_decrypted_file(&mut self) -> Option<DecryptedFileDto> {
        if self.decrypted_files.is_empty() { None } else { Some(self.decrypted_files.remove(0)) }
    }

    /// Drain roadmap events as a JSON array (stable wire format for
    /// the TS bridge).
    pub fn poll_events_json(&mut self) -> String {
        let events: Vec<EventDto> = self
            .runner
            .poll_events()
            .into_iter()
            .map(EventDto::from)
            .collect();
        serde_json::to_string(&events).unwrap_or_else(|_| "[]".to_string())
    }
}

/// Wire-format event. Exposed as a plain enum so the TS bridge sees
/// `{ kind: "StepStarted", index: 0 }` etc.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind")]
pub enum EventDto {
    StepStarted { index: u16 },
    StepCompleted { index: u16 },
    RoadmapCompleted,
    PanicStopRequested,
    PanicFadeComplete,
    SafetyBlocked { reason: String },
}

impl From<RoadmapEvent> for EventDto {
    fn from(e: RoadmapEvent) -> Self {
        match e {
            RoadmapEvent::StepStarted(i) => Self::StepStarted { index: i },
            RoadmapEvent::StepCompleted(i) => Self::StepCompleted { index: i },
            RoadmapEvent::RoadmapCompleted => Self::RoadmapCompleted,
            RoadmapEvent::PanicStopRequested => Self::PanicStopRequested,
            RoadmapEvent::PanicFadeComplete => Self::PanicFadeComplete,
            RoadmapEvent::SafetyBlocked(block) => {
                let reason = match block {
                    SafetyBlock::DailyCapReached { .. } => "DailyCapReached",
                    SafetyBlock::CoolDownActive { .. } => "CoolDownActive",
                    SafetyBlock::DisclaimerNotAcknowledged => "DisclaimerNotAcknowledged",
                };
                Self::SafetyBlocked { reason: reason.to_string() }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sfx_test_fixtures::hello_pack;

    const SR: u32 = 48_000;
    const BS: u32 = 128;

    fn fresh_engine() -> Engine {
        let pack = hello_pack(0);
        Engine::new(SR, BS, &pack.public_key).expect("engine init")
    }

    #[test]
    fn init_rejects_wrong_pubkey_length() {
        assert!(matches!(
            Engine::new(SR, BS, &[0u8; 31]),
            Err(EngineError::BadPublicKeyLength)
        ));
        assert!(matches!(
            Engine::new(SR, BS, &[0u8; 33]),
            Err(EngineError::BadPublicKeyLength)
        ));
    }

    #[test]
    fn load_pack_manifest_verifies_against_bundled_key() {
        let mut engine = fresh_engine();
        let pack = hello_pack(0);
        let manifest = engine
            .load_pack_manifest(&pack.manifest_bytes, &pack.signature_bytes)
            .expect("verify and parse");
        assert_eq!(manifest.pack_id, "hello");
        assert!(engine.has_pack());
    }

    #[test]
    fn load_pack_manifest_rejects_wrong_signature() {
        let mut engine = fresh_engine();
        let pack = hello_pack(0);
        let mut bad_sig = pack.signature_bytes;
        bad_sig[0] ^= 0xFF;
        let err = engine
            .load_pack_manifest(&pack.manifest_bytes, &bad_sig)
            .unwrap_err();
        assert!(matches!(err, EngineError::Manifest(ManifestError::SignatureFailed)));
    }

    #[test]
    fn install_pack_key_enables_decrypt() {
        let pack = hello_pack(0);
        let mut engine = fresh_engine();
        assert!(!engine.has_pack_key());
        engine.install_pack_key(&pack.pack_key).unwrap();
        assert!(engine.has_pack_key());

        let file = &pack.encrypted_files[0];
        let plaintext = engine
            .decrypt_file(&file.ciphertext, &file.nonce, &file.tag)
            .unwrap();
        assert_eq!(plaintext, file.plaintext);
    }

    #[test]
    fn decrypt_without_key_returns_no_pack_key() {
        let engine = fresh_engine();
        assert!(matches!(
            engine.decrypt_file(&[0u8; 32], &[0u8; 12], &[0u8; 16]),
            Err(EngineError::NoPackKey)
        ));
    }

    #[test]
    fn pack_key_length_is_enforced() {
        let mut engine = fresh_engine();
        assert!(matches!(
            engine.install_pack_key(&[0u8; 31]),
            Err(EngineError::BadPackKeyLength)
        ));
    }

    #[test]
    fn clear_pack_key_drops_vault() {
        let pack = hello_pack(0);
        let mut engine = fresh_engine();
        engine.install_pack_key(&pack.pack_key).unwrap();
        engine.clear_pack_key();
        assert!(!engine.has_pack_key());
    }

    #[test]
    fn set_param_roundtrips_through_ring() {
        let engine = fresh_engine();
        engine.set_param(0, 1, -6.0, 20).unwrap();
        engine.set_param(0, 2, 0.0, 0).unwrap();
    }

    #[test]
    fn play_step_starts_the_runner() {
        let mut engine = fresh_engine();
        engine
            .play_step(
                r#"{"source_id":"bark","transforms":[],"duration_ms":1000,"advance_ms":1000}"#,
            )
            .unwrap();
        let events = engine.poll_events_json();
        assert!(events.contains("StepStarted"), "got {events}");
    }

    #[test]
    fn play_step_rejects_malformed_json() {
        let mut engine = fresh_engine();
        assert!(matches!(engine.play_step("not json"), Err(EngineError::Json(_))));
    }

    #[test]
    fn panic_stop_is_idempotent() {
        let mut engine = fresh_engine();
        engine.panic_stop();
        engine.panic_stop();
        engine.panic_stop();
        assert!(engine.panic_latched());
        let events = engine.poll_events_json();
        // Exactly one PanicStopRequested regardless of how many panic_stop calls.
        let matches = events.matches("PanicStopRequested").count();
        assert_eq!(matches, 1, "got {events}");
    }

    #[test]
    fn safety_block_surfaces_through_runner() {
        let mut engine = fresh_engine();
        engine.report_safety_block(SafetyBlock::DisclaimerNotAcknowledged);
        let events = engine.poll_events_json();
        assert!(events.contains("DisclaimerNotAcknowledged"), "got {events}");
    }

    #[test]
    fn process_block_advances_the_roadmap_clock() {
        let mut engine = fresh_engine();
        engine
            .play_step(
                r#"{"source_id":"bark","transforms":[],"duration_ms":50,"advance_ms":50}"#,
            )
            .unwrap();
        let input = vec![0.0_f32; BS as usize];
        let mut output = vec![0.0_f32; BS as usize];
        // 50 ms = 2400 samples = 2400/128 ≈ 19 blocks.
        for _ in 0..30 {
            engine.process_block(&input, &mut output);
        }
        let events = engine.poll_events_json();
        assert!(events.contains("StepCompleted"), "got {events}");
        assert!(events.contains("RoadmapCompleted"), "got {events}");
    }

    #[test]
    fn event_dto_serializes_with_kind_tag() {
        let dto = EventDto::StepStarted { index: 7 };
        let json = serde_json::to_string(&dto).unwrap();
        assert_eq!(json, r#"{"kind":"StepStarted","index":7}"#);
    }

    #[test]
    fn load_roadmap_accepts_multi_step_json() {
        let mut engine = fresh_engine();
        let roadmap = r#"{"id":"r1","steps":[
            {"source_id":"a","transforms":[],"duration_ms":500,"advance_ms":500},
            {"source_id":"b","transforms":[],"duration_ms":500,"advance_ms":500}
        ]}"#;
        engine.load_roadmap(roadmap).unwrap();
        assert!(engine.poll_events_json().contains("StepStarted"));
    }

    #[test]
    fn load_roadmap_rejects_malformed_json() {
        let mut engine = fresh_engine();
        assert!(matches!(engine.load_roadmap("{bad"), Err(EngineError::Json(_))));
    }

    #[test]
    fn last_peak_dbfs_defaults_to_silence_sentinel() {
        let engine = fresh_engine();
        assert!(engine.last_peak_dbfs() <= -119.0);
    }

    #[test]
    fn load_pack_verifies_decrypts_and_clears_key() {
        let pack = hello_pack(0);
        let mut engine = fresh_engine();
        // Build the encrypted-files JSON the loader expects.
        use base64::Engine as _;
        let b64 = base64::engine::general_purpose::STANDARD;
        let files_json = serde_json::to_string(
            &pack.encrypted_files.iter().map(|f| {
                EncryptedFileDto {
                    path: f.path.clone(),
                    ciphertext_b64: b64.encode(&f.ciphertext),
                    nonce_b64: b64.encode(f.nonce),
                    tag_b64: b64.encode(f.tag),
                }
            }).collect::<Vec<_>>()
        ).unwrap();
        engine.load_pack(
            &pack.manifest_bytes,
            &pack.signature_bytes,
            &pack.pack_key,
            &files_json,
        ).unwrap();
        assert_eq!(engine.decrypted_file_count(), 1);
        let taken = engine.take_decrypted_file().expect("one file queued");
        let expected = &pack.encrypted_files[0].plaintext;
        let got = base64::engine::general_purpose::STANDARD
            .decode(&taken.plaintext_b64)
            .unwrap();
        assert_eq!(&got, expected);
        assert_eq!(engine.decrypted_file_count(), 0);
        // Vault cleared after load_pack returns.
        assert!(!engine.has_pack_key());
    }

    #[test]
    fn load_pack_rejects_bad_signature() {
        let pack = hello_pack(0);
        let mut engine = fresh_engine();
        let mut bad_sig = pack.signature_bytes;
        bad_sig[0] ^= 0xFF;
        let err = engine.load_pack(
            &pack.manifest_bytes,
            &bad_sig,
            &pack.pack_key,
            "[]",
        ).unwrap_err();
        assert!(matches!(err, EngineError::Manifest(_)));
    }
}
