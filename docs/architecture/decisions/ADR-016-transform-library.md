# ADR-016: Transform library — research-driven core + signature transforms

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Audio

## Context

The transform library is the product's core differentiator. Every transform we ship is a lever a user (Tier 3) or a pre-built roadmap (Tier 2) can pull to make a trigger sound less distressing while preserving enough identity that generalization to the real-world stimulus still occurs. Transforms that don't map to evidence-based exposure principles risk being gimmicks.

## Decision

The v1 transform library is **anchored in research-driven primitives** that appear in the exposure-therapy and auditory-therapy literature:

| Transform | Exposure-therapy anchor |
|---|---|
| Gain envelope / attenuation | Intensity reduction (primary lever) |
| Low-pass filter | Remove high-frequency startle components |
| High-pass filter | Remove rumble / sub-bass pressure |
| Band-pass / parametric EQ | Target specific triggering frequency bands |
| Spectral softening (transient reducer) | Dampen percussive onsets without losing identity |
| Pink-noise masking | Partial perceptual masking at controllable SNR |
| Time stretch (phase-vocoder) | Slow onsets; extend exposure duration without pitch shift |
| Reversal | Decouple from semantic anticipation |
| Partial mute / zoning | Silence specific time windows (e.g. the bark peak) |

Plus **two signature transforms** beyond the research baseline:

- **Extreme pitch-shift LFO (user-specified signature).** Modulates the sound's core frequencies up and down, with a range that can **exceed naturalistic pitch boundaries** (±24 semitones or more). Controls:
  - **Oscillation speed** (Hz, 0.05 – 20 Hz range).
  - **Intensity** (semitones, ±0 to ±48).
  - **Duration** (per-cycle envelope or bounded run).
  - De-naturalizes the trigger while keeping timbre recognizable.

- **Binaural beats generator.** A real-oscillator binaural carrier (L and R sine oscillators with a programmable frequency offset Δ). Controls:
  - **Carrier frequency** (Hz).
  - **Beat frequency** (Δ Hz — the difference between L and R).
  - **Blend level** (mix with the trigger or use standalone).

Each transform implements a common `Transform` trait in `packages/rust-core/src/transforms/`, with:
- Sample-accurate processing at the audio-thread block size.
- No allocation in the audio callback.
- A serializable parameter state (for preset JSON in packs, for Tier 3 saved roadmaps).

## Consequences

### Positive
- A clinical story to tell therapists and researchers ("our transforms come from the exposure-therapy literature") when the therapist plugin ships.
- The signature pitch-shift LFO is a recognizable differentiator.
- Transform parameters serialize to roadmap JSON; roadmaps become the product's shareable unit.

### Negative / trade-offs
- Writing audio-thread-safe DSP in Rust/WASM takes more care than reusing Web Audio built-ins; some transforms (phase-vocoder, transient reducer) are meaningful engineering effort.
- Two signature transforms widen v1 scope slightly vs a minimal research-only set.

### Neutral / to watch
- Non-real-time transforms (e.g., offline pack pre-rendering for Tier 2 pre-built roadmaps) can live in `pack-tooling` and use non-RT-safe algorithms; keep the real-time transform set minimal and performant.
- The transform library is a stable API surface — later versions must keep parameter serialization backward-compatible so older saved roadmaps still play.

## Alternatives considered

- **Minimal v1 (2–3 transforms).** Ships faster; weak demo; delays the hard engineering.
- **Kitchen-sink (everything in DSP textbooks).** Dilutes the clinical story and the UX.
- **Research-only (drop the signature transforms).** Safer but loses the product's signature feel.

## References

- Related ADRs: ADR-008 (tier access to transforms), ADR-015 (safety rails apply to all transforms).
- `docs/product/feature-matrix.md` for the full tier-by-tier transform availability.
