# ADR-006: CDN + encrypted packs + serverless key endpoint

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Backend

## Context

Soundsafe distributes audio content (trigger packs, roadmap packs, music packs) that is sometimes paid. We need to:
1. Serve large audio files efficiently and globally.
2. Gate access so paid content is not trivially extractable via a leaked URL.
3. Avoid running a full backend server for v1.

The user already owns a DigitalOcean Spaces + CDN account.

## Decision

v1 backend is:

1. **DigitalOcean Spaces (S3-compatible) + CDN** as the origin for pack files. Packs are **encrypted at rest** (see ADR-010) before upload.
2. A **small serverless endpoint** (Cloudflare Worker or DigitalOcean Function) that:
   - Verifies a signed Stripe-derived entitlement JWT (ADR-007).
   - Returns the pack's decryption key for the requested pack ID, if entitled.
3. **No always-on server** for v1.

## Consequences

### Positive
- Scales to zero; minimal ongoing cost.
- Small attack surface: CDN is content-only, the worker is stateless.
- Reuses hosting the user already owns.

### Negative / trade-offs
- Entitlement logic lives at the serverless edge; any revocation requires either short JWT TTL or a denylist the worker must consult. See GAP-003.
- Worker cold-starts add latency to first-play, though pack data is CDN-cached.

### Neutral / to watch
- The serverless function is the only "backend" we run in v1. Keep its implementation tiny and auditable.
- Pack publisher tooling (ADR-005 `pack-tooling`) is an offline CLI that writes encrypted packs + signs the manifest. It does **not** live on the serverless edge.

## Alternatives considered

- **Signed URLs with unencrypted packs.** Simpler; a leaked URL leaks the pack. Rejected for paid content.
- **Full managed backend (Supabase/Firebase).** Faster to build user accounts, but the therapist plugin will need a different (HIPAA-eligible) stack anyway.
- **Rust axum backend on managed hosting.** Elegant; heavier to own and deploy for an MVP.
- **Browser-native DRM (EME/Widevine).** Strongest protection; hostile to offline and minority browsers; license-server cost; overkill for this content.

## References

- Related ADRs: ADR-007 (entitlements), ADR-010 (pack encryption).
- `dev_communication/shared/specs/sound-delivery.md` for the full delivery pipeline.
