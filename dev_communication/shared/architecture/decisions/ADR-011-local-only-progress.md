# ADR-011: Local-only progress (IndexedDB + OPFS)

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Storage

## Context

Users progressing through a desensitization roadmap benefit from resumability: their current step, previous distress ratings, transform chain history, and decrypted audio segments ready to play. All of this is useful state. But the moment any of it is transmitted off-device tied to a user identity, we re-enter GDPR personal-data scope — and, for subjective distress ratings, arguably health data.

ADR-003 says v1 has no PHI. We still want useful resumability.

## Decision

All progress / state is stored **locally in the browser**:

- **IndexedDB** for structured data: saved roadmaps, step progress, distress ratings, UI preferences, safety-control settings.
- **OPFS (Origin Private File System)** for cached decrypted audio segments for the currently active roadmap, size-capped and evicted on pack change.

No progress data is transmitted to any server in v1. Cross-device sync is explicitly out of scope (noted in the feature matrix as "v2").

## Consequences

### Positive
- Zero PHI exposure. Zero GDPR personal-data exposure beyond what ADR-009 already allows.
- Works offline after the app is loaded and entitled packs are cached.
- No backend to build or maintain.

### Negative / trade-offs
- Users lose state if they clear browser storage or switch devices.
- No crash-recovery across devices.
- Paid users may feel it unfair that their saved roadmaps don't sync. Mitigated by the explicit "v2" marker in the feature matrix and by local export (Tier 3 can export roadmap JSON; users can move it manually).

### Neutral / to watch
- OPFS quota exhaustion policy is not yet specified (GAP-002).
- Schema evolution for IndexedDB requires explicit migration code; keep it simple and versioned from the first release.

## Alternatives considered

- **Cloud-synced progress for paid users.** Best UX; puts ratings + progress on a server tied to an identity, which is GDPR personal data — not PHI, but still non-trivial compliance scope. Deferred.
- **Encrypted cloud backup (server-blind).** Possible future direction; sync conflict resolution is non-trivial. Deferred.
- **No progress tracking in v1.** Fastest to build; undermines the "roadmap" value prop.

## References

- Related ADRs: ADR-003, ADR-009.
- Related gaps: GAP-002 (OPFS quota policy).
