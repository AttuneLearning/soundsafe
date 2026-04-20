# ADR-008: Tier 2 is passive playback; Tier 3 is user-built

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Product

## Context

The product has four user-facing tiers: Free, Relaxation (Tier 2, low-fee), Interactive (Tier 3, higher-fee), and a future Therapist tier. The boundary between Tier 2 and Tier 3 drives almost every scoping decision: which UI surfaces exist, which transforms have user-facing controls, whether a user can save or export a roadmap.

## Decision

- **Tier 2 (Relaxation) = passive playback.** Users play curated pre-built desensitization roadmaps and ambient / music packs. No authoring, no transform tweaking, no save-and-share.
- **Tier 3 (Interactive) = user-built.** Users pick triggers from the catalog, chain transforms in an editor, build and save custom roadmaps, and export roadmap JSON.

The boundary is effectively *"can the user author?"*

## Consequences

### Positive
- Sharp, easy-to-explain value ladder at sale time.
- Tier 2 can ship with a simpler UI (no roadmap editor).
- Tier 3 differentiates on authoring — a capability, not a sound-pack bundle.

### Negative / trade-offs
- Tier 2 users who discover they want to tweak one thing must upgrade fully.
- Some transforms (e.g., binaural beats) have pre-built presets in Tier 2 but full controls in Tier 3; the UI must gracefully hide/show controls.

### Neutral / to watch
- Exported roadmaps from Tier 3 should be playable by Tier 2 users — sharing drives top-of-funnel.

## Alternatives considered

- **Tier 2 = non-desensitization (pure wellness); Tier 3 = all desensitization.** Cleaner clinical/wellness separation, but reduces Tier 2's perceived value.
- **Tier 2 = guided desensitization; Tier 3 = add authoring.** Similar to the chosen split; rejected in favor of the starker "can the user author?" rule.

## References

- Related ADRs: ADR-015 (safety-control tunability is also Tier-3-gated).
- `docs/product/feature-matrix.md` for the full per-feature split.
