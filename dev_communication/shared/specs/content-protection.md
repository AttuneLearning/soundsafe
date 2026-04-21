# Content Protection on Soundsafe — Guidance for Publishers

**Audience.** Content licensors, pack publishers, and their legal / business stakeholders. Use this document as the basis of our licensing conversation and the shared understanding of what Soundsafe does and does not protect.

## 1. TL;DR

Soundsafe is a browser-based audio therapeutics app. Pack content is delivered encrypted, keys are delivered after an entitlement check, and the decryption and playback pipeline is designed to keep casual actors out. We **do not** attempt to defeat the analog hole, DevTools-class extraction, or a determined user on their own device. That is a deliberate posture proportional to the content and the platform.

## 2. What Soundsafe does protect against

| Threat | How it's addressed | Reference |
|---|---|---|
| Intercepting pack content on the wire | HTTPS + per-pack AES-256-GCM encryption; CDN only holds ciphertext | ADR-006, ADR-010 |
| Tampering with the pack manifest | Ed25519-signed manifests; verified before any value inside the manifest is trusted | `sound-delivery.md §2` |
| Replaying encrypted files with swapped nonces | GCM auth tag binds ciphertext ↔ key ↔ nonce; tampering fails the tag check | `sound-delivery.md §7` |
| Non-entitled users accessing paid content | Stripe + RS256 JWT entitlement; short TTL; scope-checked server-side | ADR-007 |
| Refund / subscription-lapse abuse | Short JWT TTL bounds post-lapse access to ~1 hour; offline grace bounded at 72 h | ADR-007, ADR-011, `sound-delivery.md §3` |
| Casual disk-level inspection of cached decrypted audio | OPFS files stored under opaque UUID names with no extensions in UUID-named directories; no mapping on disk; no URL-addressable handles | ADR-025 |
| Extracting audio via right-click "Save as…", drag-and-drop, or `<a download>` links | Decrypted audio is never converted to a URL-addressable resource; lint-enforced in the codebase | ADR-025 |

## 3. What Soundsafe does not protect against

| Threat | Why we cannot | Mitigation posture |
|---|---|---|
| OS-level audio recording (Audacity loopback, OBS, system audio capture) | Universal limitation of any browser audio app — "if it plays, it can be recorded" | Accepted risk |
| DevTools / JS-console extraction by a user on their own device | Any JavaScript running on the Soundsafe origin has full OPFS access by design | Accepted risk |
| Browser extensions with page-level permissions | Extensions with "read data on sites you visit" inherit origin-level access | Accepted risk |
| Memory forensics (heap dumps of the browser process) | Decoded audio transits linear memory; we minimize the window but cannot eliminate it | Accepted risk |
| Root / admin access to the browser profile directory | Outside the threat model for any browser app | Accepted risk |

These are captured in `sound-delivery.md §7` (threat model) with the same disposition.

## 4. Why this posture

**Proportionality.** Soundsafe's content is curated therapeutic audio — sound packs for exposure therapy, ambient tracks, solfeggio-tuned instrumental beds. It is valuable, licensed content, but it is not premium film or a new-release music catalogue. The economic value of a single pack extracted and republished is low; the population of users motivated to do so is small; the distribution channels for "extracted Soundsafe pack" are effectively non-existent.

**Platform realities.** Soundsafe chose the browser as its delivery platform (ADR-001, ADR-006) for reach, zero-install, and ease of updates. The browser's open execution model — any script on your origin can read your OPFS, any user can open DevTools — is a direct consequence of that choice. The alternative (browser-native DRM via EME/Widevine) was explicitly rejected (ADR-006) because it adds a license-server cost, fails on minority browsers and offline use, and is overkill for this content.

**What we do not ask of you.** We do not ask you to treat Soundsafe as a DRM-hardened distribution channel. If your licensing model requires that level of protection (for example, a first-window feature film), Soundsafe is not the right platform. We would rather have that conversation candidly than misrepresent the guarantee.

## 5. What we ask of you

- Treat Soundsafe as **"encrypted-at-rest, key-gated, best-effort on-device"** distribution.
- Accept that the analog hole exists and a determined user can, with effort, capture the audio they hear.
- Grant Soundsafe license terms compatible with browser-based delivery — no clauses that would be broken by a user opening DevTools.
- Accept our signed-manifest and per-pack AES-256-GCM encryption as the technical floor, alongside the short-TTL JWT entitlement flow.

## 6. How to contact us

Questions about the threat model, the encryption format, or specific licensing clauses: reach out with this document as the starting point. We are happy to walk through any specific scenario before a contract is signed.

## References

- ADR-001 — Web/PWA for MVP
- ADR-003 — No PHI in consumer app
- ADR-006 — CDN + encrypted packs + serverless key endpoint
- ADR-007 — Freemium via Stripe + signed-JWT entitlements
- ADR-010 — Per-pack AES-256-GCM pack encryption
- ADR-011 — Local-only progress
- ADR-025 — Content protection posture
- `sound-delivery.md §2` (pack format), `§3` (key and entitlement flow), `§7` (threat model)
