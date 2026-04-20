# ADR-012: No user-supplied audio in v1

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Scope

## Context

A plausible future feature is letting users record or import their *own* trigger sound — their actual crying baby, their specific dog, their apartment's fire-alarm beep. This dramatically improves clinical efficacy for specific phobias, but introduces:

- Moderation requirements (if shared) and DMCA / takedown processes.
- Storage-of-user-content obligations under GDPR (and, if linked to a named user, PHI).
- The possibility of minors' voices being captured without informed consent.
- Potentially harmful content (e.g., recordings of abusers) that demand careful handling.

## Decision

v1 uses **only curated, vetted sounds from Soundsafe-published packs**. No user recording, no user upload, no user-supplied content.

## Consequences

### Positive
- Sidesteps moderation, copyright, minors-voice, and PHI questions entirely for v1.
- Keeps the encrypted-pack pipeline (ADR-010) as the single content path.
- Simpler safety story: all content is known, catalogued, and reviewable.

### Negative / trade-offs
- Users with highly specific triggers (a particular neighbor's dog) get a less-targeted experience.
- May feel limiting to clinically motivated users.

### Neutral / to watch
- Revisit for v2. The preferred v2 direction is **local-only recording** — audio stays on the user's device, never uploaded — which preserves the privacy posture without needing moderation. A cloud-shared variant with moderation is a larger v3+ question.

## Alternatives considered

- **Local-only recording in v1.** Tempting and low-risk, but the audio-IO UX (mic permissions, trim, level-check) is a meaningful scope addition that dilutes the MVP.
- **Cloud upload with moderation in v1.** Explicitly rejected; creates moderation, ToS, DMCA, and GDPR storage obligations on day one.

## References

- Related ADRs: ADR-003, ADR-006, ADR-010.
