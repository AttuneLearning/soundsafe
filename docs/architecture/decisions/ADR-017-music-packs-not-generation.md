# ADR-017: Music ships as curated packs in v1; no procedural / AI generation

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Content

## Context

Relaxation content (ambient music, solfeggio-tuned beds, instrumental tracks, guided breathing beds) is a natural part of the Relaxation tier and a useful optional carrier layer in the Interactive tier. There are two broad approaches: ship curated recorded audio in packs, or generate music on-device (procedural synthesis, or model-driven / AI generation).

## Decision

v1 ships **curated, pre-recorded music packs** via the same encrypted-pack pipeline as trigger packs (ADR-006, ADR-010). There is **no procedural or AI music generation in v1.**

The **binaural beats effect** is a separate story — it *does* ship in v1 (ADR-016) as a real-time oscillator transform, because it is deterministic, trivially small, and implemented with plain sine oscillators, not a generative model.

## Consequences

### Positive
- One content pipeline for both triggers and music — lower engineering cost.
- Licensing is straightforward: we own or license the recordings and distribute them like any other pack.
- No model-distribution, model-licensing, or model-safety questions in v1.
- Music packs can be high-quality studio recordings; we're not bottlenecked by what a generator can produce.

### Negative / trade-offs
- Music library is bounded by what we publish; users can't "roll their own" background bed.
- Music packs are bigger downloads than synthesized audio would be.

### Neutral / to watch
- Procedural music generation is a plausible v2 direction if users ask for endless, personalized beds. It is its own ADR (licensing, quality, safety) at that point.

## Alternatives considered

- **Procedural generation in v1.** Adds meaningful engineering scope (model choice, on-device compute, output safety).
- **No music content at all in v1.** Leaves the Relaxation tier thin.

## References

- Related ADRs: ADR-006, ADR-008, ADR-010, ADR-016.
