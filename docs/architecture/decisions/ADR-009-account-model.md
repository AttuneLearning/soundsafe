# ADR-009: Anonymous free tier; account only for paid

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Identity

## Context

Account-creation friction kills top-of-funnel for apps in health-adjacent spaces where trust matters. Meanwhile, we need *some* identity for Stripe subscriptions, entitlement JWTs, and customer support.

## Decision

- **Free tier:** fully anonymous. No account, no email, no identifier collection beyond what the CDN inevitably sees (IP).
- **Paid tiers:** account creation is required at checkout — email + password, or magic link.

## Consequences

### Positive
- Lowest possible friction for new users to try the product.
- Matches ADR-003 (no PHI) and minimizes GDPR personal-data collection for the largest cohort.
- Free tier works entirely offline after initial load.

### Negative / trade-offs
- No ability to recover free-tier state across devices (acceptable; matches ADR-011 local-only progress).
- We cannot market to free users by email.
- Stripe customer IDs become the canonical identifier for paid users; we do not maintain a parallel identity system in v1.

### Neutral / to watch
- Keep the paid sign-up flow short: email + password, email verification optional at first use, no mandatory profile fields.
- No social / OAuth sign-in for v1 (adds platform review surface with no v1 benefit).

## Alternatives considered

- **Account required from first launch.** Higher drop-off; unnecessary for free users.
- **Optional account, local-first with opt-in sync.** Best UX eventually; two storage paths to maintain — deferred.
- **OAuth-only (Google / Apple).** Faster sign-up but ties identity to third parties, and some users resist it.

## References

- Related ADRs: ADR-003, ADR-007, ADR-011.
