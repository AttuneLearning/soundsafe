# ADR-010: Per-pack AES-256-GCM, key delivered after JWT check

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Security

## Context

Paid sound packs live on a public CDN (ADR-006). Without content-level protection, a leaked URL or a clever scraper could extract the entire library. We need a content-protection model that:
- Does not require a full DRM stack (EME/Widevine rejected in ADR-006).
- Works offline after first legitimate access.
- Is simple enough to audit.

## Decision

Each pack is encrypted at build time with a unique **AES-256-GCM** key:

- The pack builder (`packages/pack-tooling`) generates a random 256-bit key per pack, encrypts each audio file with a unique nonce, and stores each file's auth tag alongside.
- Pack key material is stored in a separate key registry (not on the CDN).
- On playback, the client presents its entitlement JWT (ADR-007) to the serverless key endpoint. The endpoint verifies the JWT, confirms the pack is in the user's entitlement scope, and returns the pack key.
- The key is held **only in WASM linear memory**, passed to the decryption routine on-the-fly, and zeroed on pack unload.

Pack manifests are additionally **signed with an Ed25519 key**; the client verifies the manifest signature against a bundled publisher public key before trusting anything inside.

## Consequences

### Positive
- A leaked CDN URL leaks only ciphertext.
- Per-pack keys limit blast radius if any single pack key leaks.
- Ed25519 signing prevents a compromised CDN origin from injecting malicious manifests.

### Negative / trade-offs
- Not DRM: a determined attacker with a running session can extract the in-memory key. Accepted as proportionate to content value.
- Key distribution requires the key endpoint to be available — affects offline first-play of a newly downloaded pack.
- Pack publisher-key rotation is a separate problem (tracked as GAP-005).

### Neutral / to watch
- Nonce management: each file gets a fresh random nonce; never reuse across re-encodes.
- The WASM runtime must not expose keys via debugging hooks or error messages.

## Alternatives considered

- **Signed URLs, unencrypted packs.** Simpler but weaker: leaked URL = leaked pack.
- **Per-user wrapped keys (envelope encryption).** Better for revocation; more moving parts; deferred — may revisit if churn-driven leakage becomes a real problem.
- **Browser-native DRM (EME/Widevine).** Too heavy; see ADR-006.

## References

- Related ADRs: ADR-006, ADR-007.
- Related gaps: GAP-003 (revocation), GAP-005 (publisher-key rotation).
