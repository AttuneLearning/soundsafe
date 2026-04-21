# ADR-024: Phone form-factor — Tier 3 authoring is desktop/tablet only for v1

**Status:** Accepted
**Date:** 2026-04-20
**Domain:** Product

## Context

The Tier-3 workspace (see mockup at `specs/mockups/tier-3-interactive.html`) is a dense authoring surface: transform chain cards with multiple parameter sliders, a step timeline, a transform index, and a safety dashboard — all visible simultaneously. It is designed for a ≥1360 px desktop surface and degrades gracefully down to tablet.

Below ~768 px (phone), the design collapses to a single column. The underlying UX problem is not purely layout: a user is doing fine-grained slider adjustments on audio that may be actively triggering. Fat-finger interactions on distressing audio are a real safety risk — a thumb slip on "LP cutoff" can suddenly expose unattenuated frequencies; a slip on "Intensity ± semitones" can push the pitch-shift LFO to a more jarring range than intended.

Tier 2 (Relaxation) has a passive playback UX that works on phone: pick a pre-built roadmap, press play, let it run. No fine-grained slider work.

## Decision

**Tier-3 authoring is not supported on phone form factors (<768 px viewport) in v1.**

- At or above 768 px: progressive collapse as per the responsive strategy (three columns ≥1360 px; transform-index collapses to drawer 1024–1360 px; library becomes top tab bar 768–1024 px).
- Below 768 px: the Tier-3 workspace does not render. Entitled users are offered a route into Tier-2 passive playback of saved and curated roadmaps; unentitled users see a "best experienced on a larger screen" message.
- Roadmap authoring, transform chain editing, and safety-value tuning are all desktop/tablet actions.

This is a **deliberate ship-later**, not a lack of design time. A dedicated mobile Tier-3 UX is a post-v1 concern, likely aligned with a mobile shell (ADR-001) where authoring can use native pickers and larger touch targets.

## Consequences

### Positive
- Tier 3 users get a full-fidelity desktop experience from day 1 without degraded phone compromises diluting it.
- Safety risk from fat-finger slider slips on a triggering sound is removed.
- Scope of M2 is bounded: one responsive layout to ship, not two UX paradigms.
- Tier 2 (playback) keeps mobile value; the product is not useless on phone.

### Negative / trade-offs
- Tier-3 subscribers using a phone-only lifestyle cannot author on mobile. We expect this to be a small population — Tier 3 is the "interactive / builder" tier, which skews toward users with a desktop or tablet workflow.
- Marketing copy for Tier 3 must be clear about this limitation. "Desktop and tablet only for authoring; play anywhere" is the honest framing.
- If pilot feedback says mobile authoring is critical, this ADR needs an early superseding decision, not a v2 afterthought.

### Neutral / to watch
- The 768 px breakpoint is a proxy for "not a phone." If a Pixel Fold-class foldable is used above 768 px in landscape, it gets the tablet UX; below 768 px folded, it gets the phone fallback. This is correct behavior, not a bug.
- Telemetry should track "how many Tier-3 subscribers hit the phone-fallback screen, and how often." (ADR-011 local-only telemetry — reports are aggregates, not user-identifying.)

## Alternatives considered

- **Ship a one-column Tier-3 UX on phone.** Rejected: safety risk of fat-fingered parameter edits on distressing audio; UX complexity doubles; dilutes the desktop experience.
- **Block Tier-3 purchase / upgrade on phone browsers.** Considered and rejected: some users upgrade on mobile and use on desktop; blocking the upgrade flow creates a worse experience than showing an explanatory screen on the authoring surface itself.
- **Defer the decision, show a best-effort responsive layout, iterate.** Rejected: iterating is fine but "best-effort responsive" is exactly what breeds the safety risk. Better to have no phone Tier-3 UX than a bad one.

## References

- ADR-001 (Web/PWA for MVP; mobile later)
- ADR-008 (Tier 2 = passive; Tier 3 = user-built)
- ADR-015 (safety posture; fat-finger risk context)
- `specs/mockups/tier-3-interactive.html`
- Plan: `/home/adam/.claude/plans/distributed-napping-lemon.md` §Responsive / form-factor strategy
