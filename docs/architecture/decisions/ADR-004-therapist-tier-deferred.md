# ADR-004: Therapist tier deferred to a compliant plugin or companion app

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Scope

## Context

The product vision includes therapist-led treatment protocols: a therapist builds or assigns a roadmap, the client works through it, and progress flows back. That feature set inherently handles PHI (ADR-003). Shipping it inside the consumer MVP would drag the entire codebase into HIPAA + GDPR compliance scope on day one.

## Decision

Therapist-facing features are delivered in a **separate HIPAA + GDPR-compliant plugin or companion app**, added after v1. The v1 architecture reserves clean integration seams but ships none of the plugin's functionality.

## Consequences

### Positive
- v1 ships without compliance ceremony.
- The therapist track can later pick its own stack (HIPAA-eligible hosting, BAAs, audit logging) without being constrained by consumer-app decisions.
- Separate release cadences; the therapist track can take longer to harden without blocking the consumer app.

### Negative / trade-offs
- Some users will expect therapist integration in v1 and be disappointed.
- Two products to market eventually.

### Neutral / to watch
- The shared `rust-core` must maintain a stable API that the plugin can depend on.
- Reserved seams in v1:
  - `AssignmentProvider` interface (consumer app has a no-op implementation).
  - `ProgressSink` interface (consumer writes only to the local in-memory sink; plugin can replace it with an encrypted-export sink).
  - Pack-manifest format reserves fields for plugin-assigned roadmaps and signed prescriptions.

## Alternatives considered

- **Bundle therapist features in v1 behind a paid gate.** Rejected: paid-gating doesn't reduce compliance scope.
- **Skip therapist features entirely.** Rejected: therapist integration is a core part of the long-term product.

## References

- Related ADRs: ADR-003, ADR-005 (reserved package slot for `therapist-plugin`).
