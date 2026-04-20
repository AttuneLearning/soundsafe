# ADR-007: Freemium via Stripe + signed-JWT entitlements

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Monetization

## Context

We need a monetization model that matches the three-tier product shape (Free / Relaxation / Interactive) and pairs cleanly with the encrypted-pack delivery model (ADR-006). Options include in-app subscriptions, one-time pack purchases, subscription-only, or deferring monetization entirely.

## Decision

The v1 consumer app is **freemium with Stripe subscriptions**. Paid entitlements are represented as **signed JWTs** issued by a small Stripe webhook handler.

- **Free tier:** no account, no payment, curated previews + always-on safety.
- **Relaxation tier (paid):** Stripe subscription unlocks passive playback of curated packs and pre-built roadmaps.
- **Interactive tier (paid):** higher-priced Stripe subscription that additionally unlocks user-built roadmaps, the full transform library, and tunable safety controls.

Entitlement JWTs are:
- Signed with RS256 using a rotating key pair; public keys served from a versioned JWKS endpoint.
- Short-lived (hours, not weeks) to keep revocation latency bounded.
- Scoped to pack families (e.g., `pack:misophonia-core`, `tier:interactive`).

## Consequences

### Positive
- No app-store cut on web.
- Stripe handles payment, tax, dunning, refunds.
- JWTs are stateless; the key endpoint can verify without a database lookup.

### Negative / trade-offs
- Short JWT TTL means the app must refresh periodically; affects offline UX (handled by ADR-006 offline grace window).
- Revocation on refund requires either short TTL or a denylist (see GAP-003).

### Neutral / to watch
- Stripe webhook receiver must be idempotent and replay-safe.
- Test-mode Stripe keys must never leak to production builds; environment separation is enforced in `infra/workers/`.

## Alternatives considered

- **One-time pack purchases.** Better match for "I just want this one pack." Lower recurring revenue; considered for a later complementary model.
- **Subscription only, no free tier.** Worst top-of-funnel for a trust-dependent health-adjacent tool.
- **Defer monetization.** Valid for private beta, not for v1 launch.

## References

- Related ADRs: ADR-006, ADR-009, ADR-010.
