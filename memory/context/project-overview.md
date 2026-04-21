# Project Overview

## Mission

Soundsafe is a sound-desensitization PWA for users who experience triggering responses to specific environmental sounds (dog barks, sirens, crying babies, chewing, alarm clocks, etc.). The app lets a user pick a trigger, apply a chain of audio transforms that reduce its triggering intensity, and step through a graduated "roadmap" from a heavily modified version of the sound toward the raw stimulus — all self-paced, fully local, with always-on safety rails.

The product targets self-guided exposure work outside a clinical setting. Therapist-mediated use is reserved for a future HIPAA + GDPR-compliant plugin (ADR-004) and is explicitly out of v1 scope.

## Architecture Snapshot

- **Frontend:** React + TypeScript PWA (`packages/consumer-app`), shared component library (`packages/ui-kit`), platform abstraction (`packages/platform`) for future Tauri desktop and eventual mobile shells.
- **Audio core:** Rust compiled to WASM via `wasm-bindgen` — DSP transforms (`crates/sfx-dsp`), signature transforms (`crates/sfx-signature`: Extreme Pitch-Shift LFO + Binaural Beats), block-based audio graph (`crates/sfx-audio-graph`), pure roadmap state machine (`crates/sfx-roadmap-engine`), type-level safety rails (`crates/sfx-safety`).
- **Pack delivery:** Encrypted packs from a CDN (`crates/sfx-pack-manifest` + `crates/sfx-pack-vault`); per-pack AES-256-GCM keys delivered via a Cloudflare Worker after Stripe + signed-JWT entitlement (`infra/workers/`).
- **Local-only state:** IndexedDB (progress, roadmaps, JWT, settings) + OPFS (decrypted audio chunks, UUID-named, per ADR-025). No cross-device sync in v1 (ADR-011).
- **Therapist-plugin seams:** `AssignmentProvider` and `ProgressSink` TypeScript interfaces, `therapist.*` reserved manifest fields, empty `crates/sfx-comms-crypto` crate. v1 ships none of the therapist code; the plugin attaches later.

## Current Priorities

- **M1 (next milestone, ~3 weeks):** minimum playable end-to-end. `sfx-dsp` ships the Gain envelope transform with the nine proptest invariants; `sfx-pack-vault` decrypts a hand-built "hello pack"; `audio-graph-ts` wires the AudioWorklet + WASM + fast-ring; consumer-app plays a gain-attenuated dog bark with panic-stop fading to silence in 500 ms.
- **M2 (~5–6 weeks after M1):** the Tier-3 workspace mockup becomes a running app. Full transform library, signature transforms with golden-file snapshots, roadmap import/export, full E2E suite, bundle budgets met.
- **Cross-cutting:** keep the ADR set current as decisions are made; periodic ADR-drift audit weekly; exercise the specialized review subagents on every PR.
