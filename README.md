# Soundsafe

A sound-desensitization tool. Pick an environmental trigger (dog bark, siren, crying baby, alarm, chewing, etc.), apply a chain of audio transforms that reduce its triggering intensity, and step through a graduated roadmap from a heavily modified version toward the raw sound.

Rust/WASM audio core, React/TypeScript UI, encrypted sound packs delivered from a CDN, fully local playback and state.

## Status

**Pre-code.** This repo currently contains planning documents only. No code yet. See the bootstrap plan for how the workspace will come together.

## Start here

| If you are… | Read |
|---|---|
| Trying to understand the product | [`docs/product/feature-matrix.md`](docs/product/feature-matrix.md) |
| Trying to understand the architecture | [`docs/architecture/sound-delivery.md`](docs/architecture/sound-delivery.md) |
| Looking for the rationale behind a design choice | [`docs/architecture/decision-log.md`](docs/architecture/decision-log.md) |
| Working with Claude Code on this repo | [`CLAUDE.md`](CLAUDE.md) |

## Scope of v1

Public consumer MVP. Three tiers:

- **Free** — anonymous, curated previews, always-on safety rails.
- **Relaxation** — passive playback of curated pre-built roadmaps + ambient/music packs.
- **Interactive** — user-built roadmaps, full transform library (including the signature extreme pitch-shift LFO and a binaural-beats generator), tunable safety settings.

Therapist-facing features (assignment, messaging, progress tracking tied to a named client) are **out of scope for v1** and reserved for a later HIPAA + GDPR-compliant plugin or companion app. No protected health information is handled in v1.

## License

TBD.
