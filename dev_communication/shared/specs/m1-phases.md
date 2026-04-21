# M1 Phase Plan — Minimum Playable

**Status:** Planning + early execution
**Owner:** Fullstack-Dev (implementation), Fullstack-QA (verification)
**Estimated duration:** ~3 weeks
**Architecture reference:** `/home/adam/.claude/plans/distributed-napping-lemon.md` §Phased implementation

## Goal

End-to-end audio path with full safety rails enforced: a user acknowledges the disclaimer, picks a pack, presses play, hears a gain-attenuated dog bark with the ramp-up envelope perceptible, presses Esc, hears a 500 ms fade to silence. One transform (Gain envelope), one pack (the hand-built "hello pack"), one roadmap step (Timer-advance). Crypto, decrypt, audio graph, roadmap engine, WASM bridge, AudioWorklet, React UI all wired enough to demonstrate the end-to-end flow.

## Exit criterion

A fresh clone passes:

```bash
cargo nextest run --workspace --all-features        # all M1 tests green
pnpm install && pnpm -r typecheck && pnpm test       # TS + vitest green
wasm-pack test --node packages/rust-core             # WASM boundary green
pnpm --filter @soundsafe/consumer-app dev            # boots; manual flow works
```

Manual flow: disclaimer → load hello pack → play → audible attenuated audio → Esc → ~500 ms fade → silence.

Plus: `pnpm exec playwright test` covers the full disclaimer-to-panic flow as an E2E.

## Three-tier review hierarchy

| Tier | When | Who |
|---|---|---|
| **Per-PR** | Every commit | CI (`cargo nextest`, `vitest`, `wasm-pack test`, `schema-drift`, `rust-audit`, `npm-audit`) + the specialized review subagent(s) matching the touched files |
| **Per-phase exit** | When a phase's FS-ISS issue moves from `active/` to QA | Fullstack-QA + the agents matching the phase's domain |
| **Per-M exit** | When the last phase in M1 is closed | Fullstack-QA + all six specialized agents + `adr-drift-detector` + manual safety walkthrough by Adam |

## Phases

Each phase is one FS-ISS issue. Issues are filed lazily — M1.0 and M1.1 are in queue at the start of M1; later phases get filed as their predecessors enter QA, to avoid stale planning.

### M1.0 — `FS-ISS-001` — Hello-pack test fixture

**Scope.** A `crates/sfx-test-fixtures` crate (dev-only, `publish = false`) that produces a deterministic in-memory "hello pack": one synthetic audio file, AES-256-GCM encrypted with a known random key + nonce, an Ed25519-signed manifest, all bundled into a `HelloPack` value used by M1.1 and M1.2 tests.

**Acceptance criteria.**
- `sfx_test_fixtures::hello_pack()` returns a `HelloPack` with: `manifest_bytes`, `signature_bytes`, `public_key`, `encrypted_files` (Vec of `{ ciphertext, nonce, tag }`), `pack_key`.
- All crypto is real (`aes-gcm`, `ed25519-dalek`). No placeholder bytes.
- Determinism: a `seed: u64` parameter produces bit-identical output across runs.
- Smoke test in the fixture crate verifies the produced manifest parses as `sfx_pack_manifest::Manifest` and the encrypted file decrypts back to the original plaintext via `aes-gcm`.
- Crate added to root `Cargo.toml` workspace members.

**Reviewers.** `crypto-reviewer`.
**CI gates.** `cargo build`, `cargo nextest -p sfx-test-fixtures`.
**Dependencies.** None (kicks off M1).

### M1.1 — `FS-ISS-002` — `sfx-pack-manifest` Ed25519 verification

**Scope.** Real Ed25519 verification in `sfx-pack-manifest`. Public function returns `Result<Manifest, ManifestError>` only after the signature verifies against the bundled publisher public key.

**Acceptance criteria.**
- `sfx_pack_manifest::verify_and_parse(manifest_bytes, signature_bytes, public_key) -> Result<Manifest, ManifestError>` exists.
- Positive test using `sfx_test_fixtures::hello_pack()`: returns `Ok(manifest)`.
- Negative tests using the same fixture with mutations:
  - Flipped bit in `manifest_bytes` → returns `Err(SignatureFailed)`.
  - Truncated `signature_bytes` → returns `Err(SignatureFailed)` or `Err(BadSignature)`.
  - Wrong public key → returns `Err(SignatureFailed)`.
- Signature verification happens **before** `serde_json::from_slice` parses the manifest body. Tampered manifest never produces a partially-parsed `Manifest`.

**Reviewers.** `crypto-reviewer`.
**CI gates.** `cargo nextest -p sfx-pack-manifest`, `rust-audit`.
**Dependencies.** M1.0.

### M1.2 — `FS-ISS-003` — `sfx-pack-vault` AES-256-GCM decryption + zeroize

**Scope.** Real AES-256-GCM decryption with `Zeroizing<[u8; 32]>` key handling per ADR-010. Streaming decrypt (writes plaintext into a caller-supplied buffer; no allocation in hot path).

**Acceptance criteria.**
- `sfx_pack_vault::PackVault::new(pack_key)` accepts a 32-byte key wrapped in `Zeroizing`.
- `PackVault::decrypt_into(&self, ciphertext, nonce, tag, out_buf) -> Result<usize, VaultError>` writes plaintext.
- GCM auth tag verified before any plaintext byte enters `out_buf`. Tampered ciphertext returns `Err(TagMismatch)` and `out_buf` is left at its prior state (or zeroed).
- `Drop` for `PackVault` zeroizes the key region.
- Tests using `sfx_test_fixtures::hello_pack()`:
  - Positive: round-trip decrypt yields original plaintext.
  - Negative: bit-flipped ciphertext → `TagMismatch`.
  - Negative: wrong nonce → `TagMismatch`.
  - Drop test: after `drop(vault)`, the key region read via a debug-only inspector is all zeros.

**Reviewers.** `crypto-reviewer` + `safety-reviewer` (zeroize discipline).
**CI gates.** `cargo nextest -p sfx-pack-vault`, `rust-audit`.
**Dependencies.** M1.0.

### M1.3 — `FS-ISS-004` — `sfx-dsp` Gain envelope transform

**Scope.** First real DSP transform: a sample-accurate Gain envelope. Implements the (M1) Transform trait surface (`prepare`, `set_param`, `process`, `reset`).

**Acceptance criteria.**
- `Gain` struct with parameters `attenuation_db: f32` (range −60 to +6, default 0) and `smoothing_ms: u16` (default 20).
- `process(&mut self, in_block: &[f32], out_block: &mut [f32])` is allocation-free; verified by an `assert-no-alloc`-style test running 10 000 blocks.
- All applicable proptest invariants from the per-PR DSP review prompt:
  1. Bypass identity (gain 0 dB → output equals input within 1e-6).
  2. Output length invariance for block sizes `1..=2048`.
  3. Finiteness for any `[-1.0, 1.0]` input + any legal params.
  4. Ceiling respected when chained with the limiter (deferred to M1.4 once chained).
  5. Determinism (no internal random; trivially holds).
  7. Smoother monotonicity for any `a → b` envelope.

**Reviewers.** `dsp-reviewer`.
**CI gates.** `cargo nextest -p sfx-dsp`.
**Dependencies.** None (parallel with M1.0–M1.2 in principle).

### M1.4 — `FS-ISS-005` — `sfx-audio-graph` chain + lock-free param ring

**Scope.** Block-based audio graph that chains Gain → Limiter → Ramp at 128-frame quantum, with a lock-free SPSC ring for parameter updates from the worklet message handler.

**Acceptance criteria.**
- `AudioGraph::new(rails: SafetyRails, transforms: Vec<Box<dyn Transform>>) -> Self` — `rails` is required, not `Option`.
- `process(&mut self, in_block, out_block)` drains up to 16 param messages from the ring per block, applies each via parameter smoothers, then runs each transform in order, then the limiter, then the ramp.
- Lock-free ring is SPSC, fixed size 256, allocation-free.
- Tests:
  - allocation-free (`assert-no-alloc`) over 10 000 blocks.
  - Invariant 4: ceiling respected after chaining.
  - Smoother monotonicity end-to-end.

**Reviewers.** `dsp-reviewer` + `safety-reviewer`.
**CI gates.** `cargo nextest -p sfx-audio-graph`.
**Dependencies.** M1.3, sfx-safety types (already present from M0).

### M1.5 — `FS-ISS-006` — `sfx-roadmap-engine` Timer-advance roadmap

**Scope.** Pure-Rust state machine for a one-step roadmap advancing on a `Timer` condition. `Clock` trait for deterministic test time.

**Acceptance criteria.**
- `RoadmapRunner::new(roadmap, clock)` constructs the engine.
- `tick(processed_samples: u32)` advances the clock and emits events (`StepStarted`, `StepCompleted`, `PanicStopRequested`, `PanicFadeComplete`).
- Insta snapshot test for a one-step roadmap with a 90-second Timer advance.
- Proptest: any sequence of inputs (`Tap`, `Suds(n)`, `PanicStop`, `Tick(n)`) produces a well-formed event trace; panic reachable from any state.

**Reviewers.** `safety-reviewer` (panic-reachability is the safety-critical invariant).
**CI gates.** `cargo nextest -p sfx-roadmap-engine`.
**Dependencies.** sfx-safety types (already present).

### M1.6 — `FS-ISS-007` — `rust-core` wasm-bindgen surface

**Scope.** WASM-exposed entry points: `engineInit`, `loadPack`, `playStep`, `panicStop`, `setParam`. Constructs the audio graph + roadmap engine. Minimal `wasm-bindgen-test` coverage.

**Acceptance criteria.**
- `engineInit(sample_rate, block_size, public_key_bytes)` returns a handle (or sets a global).
- `loadPack(manifest_bytes, signature_bytes, encrypted_files, pack_key_bytes)` returns Ok after successful verify + decrypt.
- `playStep(step_index, transforms_json, duration_ms, advance_kind)` enqueues the step.
- `panicStop()` sets the atomic flag.
- `setParam(node_id, param_id, value, smoothing_ms)` enqueues a param change into the ring.
- wasm-bindgen-tests: each function is callable; `panicStop` is idempotent; `setParam` doesn't allocate after init.
- Key handoff: `loadPack`'s `pack_key_bytes` is memcpy'd into Rust linear memory and the JS-side `Uint8Array` is zeroed (test the JS side via a wasm-bindgen-test scenario).

**Reviewers.** `platform-boundary-reviewer` + `crypto-reviewer` (key handoff).
**CI gates.** `wasm-pack test --node packages/rust-core`.
**Dependencies.** M1.1, M1.2, M1.4, M1.5.

### M1.7 — `FS-ISS-008` — `audio-graph-ts` AudioWorklet + WASM + fast-ring

**Scope.** TypeScript bridge: AudioWorklet + WASM module load + SAB-backed fast-ring reader + `useAudioEngine()` React hook.

**Acceptance criteria.**
- `AudioEngine` class wraps `AudioContext`, `AudioWorkletNode`, WASM init, fast-ring SAB.
- `engine.play()`, `engine.pause()`, `engine.panicStop()`, `engine.setParam(path, value)`, `engine.subscribe(event, cb)` all working.
- `useAudioEngine()` React hook with `useSyncExternalStore` for playhead and panic state.
- COOP / COEP headers documented (already in `vite.config.ts`).
- Vitest unit tests for the message-encoding helpers; full integration deferred to M1.9.

**Reviewers.** `platform-boundary-reviewer`.
**CI gates.** `pnpm --filter @soundsafe/audio-graph-ts test`, `pnpm -r typecheck`.
**Dependencies.** M1.6.

### M1.8 — `FS-ISS-009` — `pack-client` decrypt-worker + MSW entitlement

**Scope.** Pack download + decrypt-worker + MSW-mocked `/entitlement`. OPFS UUID-naming + the `URL.createObjectURL`-on-OPFS lint rule.

**Acceptance criteria.**
- `PackClient.unlock(packId, jwt)` calls `/entitlement`, gets the pack key, hands it to the decrypt worker.
- Decrypt worker reads encrypted bytes (from `fetch` Cache API), decrypts via WASM, writes to OPFS under v4-UUID names with no extensions.
- `opfs_index` mapping table in IndexedDB (`{packId, soundId, uuid, sha256, bytes}`) populated on decrypt.
- MSW handler returns the `sfx_test_fixtures::hello_pack` data when the test rig hits `/entitlement`.
- Lint rule: ESLint `no-restricted-syntax` rejects `URL.createObjectURL` whose argument flows from `FileSystemFileHandle.getFile()`. Includes a failing-test fixture verifying the rule fires.

**Reviewers.** `crypto-reviewer` + `platform-boundary-reviewer`.
**CI gates.** `pnpm --filter @soundsafe/pack-client test`, `pnpm -r typecheck`, `npm-audit`.
**Dependencies.** M1.6, M1.7.

### M1.9 — `FS-ISS-010` — `consumer-app` integration

**Scope.** Replace the M0 placeholder with the M1 user flow: disclaimer → pick the hello pack → play → audible Gain-attenuated audio → Esc → 500 ms fade → silence. SUDS rating UI deferred to M2.

**Acceptance criteria.**
- Disclaimer gate from M0 still works; on accept, the workspace renders.
- A "Load hello pack" affordance (button is fine; library UI lands in M2) calls `packClient.unlock()` then `engine.loadPack()`.
- Play button calls `engine.play()`.
- Esc binding (already wired to `triggerPanic` from M0) now calls `engine.panicStop()`.
- Audible verification in the dev server: Gain-attenuated audio plays; panic fades to silence in ~500 ms.
- No SUDS, no transform chain editor, no library — those are M2.

**Reviewers.** `accessibility-reviewer` + `safety-reviewer`.
**CI gates.** `pnpm --filter @soundsafe/consumer-app test`, `pnpm -r typecheck`.
**Dependencies.** M1.7, M1.8.

### M1.10 — `FS-ISS-011` — Playwright E2E for the M1 flow

**Scope.** End-to-end Playwright test exercising the full M1 flow with audio mocked at the WebAudio boundary (so CI can run headless without a sound card).

**Acceptance criteria.**
- `consumer-app/e2e/m1-flow.spec.ts` (or similar) covers: open app → see disclaimer → accept → load hello pack → click play → assert engine state is "playing" + ramp envelope is active → press Esc → assert engine state is "panic-fading" → wait 600 ms → assert state is "silenced".
- WebAudio is shimmed; engine state assertions read from the public `useAudioEngine` interface, not from real audio output.
- Test runs in CI (added to `.github/workflows/ci.yml` as a new `e2e` job).

**Reviewers.** `accessibility-reviewer`.
**CI gates.** Playwright suite green; new `e2e` CI job green.
**Dependencies.** M1.9.

### M1 exit — comprehensive review + manual safety walkthrough

Triggered when M1.10 is closed. Not an FS-ISS issue; a coordinated review pass.

- All six specialized agents run against the M1 surface.
- `adr-drift-detector` runs once.
- Adam (LPC) does a manual safety walkthrough: disclaimer language, panic UX, ramp envelope feel, fade-to-silence behavior.
- M2 phase plan (`m2-phases.md`) drafted in parallel.

## Out-of-phase work — file as separate FS-ISS issues if/when needed

- Stripe webhook + real `/entitlement` worker — **M2** (real entitlement requires UI flows; M1 uses MSW).
- `roadmap-schema` generator pipeline activation (replacing the hand-written stub) — **M2** (M1 doesn't need the generator running in CI; the stub is correct).
- Bundle budgets (WASM ≤ 600 KB, worklet boot ≤ 50 ms) — **M1.10's exit gate measures**, but if budgets blow, optimization gets its own issue.
- Cleaning up the `MEMORY_TEMPLATE.md` and other installer-scaffolded memory files — out of scope; will rationalize after M1 if anything is genuinely confusing.

## Notes on `/comms` flow

Per `FULLSTACK_DEV_ROLE_GUIDANCE.md`:

- Move issue file from `dev_communication/fullstack/issues/queue/` to `active/` when starting work.
- On dev-complete: send a `message-request` to `dev_communication/fullstack/inbox/` from `Fullstack-Dev` to `Fullstack-QA` with the commit hash, push evidence, and `Action Required` checklist.
- QA verdicts come back as `message-response` files in the same inbox. Failure → fix and re-handoff. Pass → QA moves the issue to `completed/` and sets `Status: COMPLETE`.
- Issues stay in `active/` from the moment Dev starts until QA finishes — including during back-and-forth.
