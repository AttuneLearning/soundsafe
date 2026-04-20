# ADR-003: No PHI in the consumer app

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Data / Compliance

## Context

Soundsafe will eventually have therapist-facing features (assign protocols, track progress, message clients). Those features handle protected health information (PHI under HIPAA; special-category data under GDPR Art. 9): assignment records link a named client to a treatment, progress data is health data, messages between therapist and client are clinical communication.

The key insight: the *assignment record itself* is health data, even without notes. Simply knowing "Client X is running the dog-bark desensitization protocol" implies a diagnosis. Therefore any v1 feature that stores or transmits a linkage between a named client and their protocol would pull the entire consumer app into HIPAA + GDPR compliance scope, with BAAs, audit logs, encrypted-at-rest storage, access controls, and more.

## Decision

The v1 consumer app **handles no PHI and no special-category data**. All therapist↔client linkage, assignment records, progress-tied-to-identity, clinical messaging, and clinical notes are out of scope and will be delivered in a separate compliant stack (see ADR-004).

## Consequences

### Positive
- Consumer app ships on commodity hosting with no compliance ceremony.
- Smaller attack surface and smaller legal surface.
- Free tier can be anonymous (ADR-009) with no identifier-collection concern.

### Negative / trade-offs
- The consumer app is clinically *adjacent* rather than clinical. Users self-direct; no therapist oversight in v1.
- Some user-research data (e.g., distress ratings) can be collected locally (ADR-011) but cannot be exported to a therapist in v1.

### Neutral / to watch
- Crash logs and analytics must be carefully scoped so they do not accidentally capture identifiers + usage patterns that would, in combination, look like personal data under GDPR.
- The consumer app should still avoid unnecessary identifier collection (IP, device IDs, fingerprints) as a good-practice default.

## Alternatives considered

- **Build HIPAA-compliant from day one.** Correct for the long run but expensive for an unvalidated v1. Deferred to the therapist track (ADR-004).
- **"Clinical-lite" without full compliance.** Tempting but legally ambiguous; rejected.

## References

- Related ADRs: ADR-004, ADR-009, ADR-011.
- HIPAA §160.103 (PHI definition), GDPR Art. 9 (special categories).
