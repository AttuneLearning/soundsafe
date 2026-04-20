# Context: Project bootstrap — scope, decisions, open questions

**Category:** Project
**Created:** 2026-04-19
**Last Updated:** 2026-04-19
**Tags:** #context #bootstrap

## Overview

Soundsafe is a sound-desensitization PWA. Users pick an environmental trigger sound, apply a chain of transforms that reduce its triggering intensity, and progress through a graduated roadmap toward the raw stimulus.

This context entry captures what was decided during the initial planning phase — so a future agent (or human) can pick up with the same assumptions.

## Key points

- **Consumer MVP only.** Three tiers: Free, Relaxation, Interactive. No PHI. No therapist features in v1.
- **Therapist track is deferred.** Will arrive as a HIPAA + GDPR-compliant plugin or companion app. The architecture reserves seams for it (ADR-004).
- **Web / PWA only for v1.** Native desktop / mobile later. Rust/WASM audio core so the same core can be reused under future native shells.
- **Encrypted pack delivery** from a DigitalOcean Spaces CDN + a small serverless key/entitlement endpoint. Freemium via Stripe + signed JWTs. No always-on server.
- **Local-only progress.** IndexedDB + OPFS. Zero PHI footprint.
- **Safety rails are non-negotiable.** First-run disclaimer, panic-stop, volume ceiling, and exposure caps — always on. Interactive tier can tune *values*, not turn rails off.

## Details

Full architectural rationale is in:

- [[../../dev_communication/shared/architecture/decision-log]] — indexes the ADR set.
- [[../../dev_communication/shared/specs/sound-delivery]] — end-to-end delivery pipeline.
- [[../../dev_communication/shared/specs/feature-matrix]] — master feature list by tier.
- `/home/adam/.claude/plans/cached-wishing-iverson.md` — the approved bootstrap plan.

## Implications

- New features that imply a therapist↔client linkage, or that push identifiable progress data off-device, belong in the *therapist plugin*, not the consumer app. Push back if asked to add them to v1.
- Any content added to the product goes through the encrypted pack pipeline. There is no "just drop a file in public/" path.
- The panic-stop and first-run disclaimer are always on. Proposals to disable them should be rejected.

## Open questions

Catalogued as gaps in [[../../dev_communication/shared/architecture/gaps/index]]. Short list:

- OPFS quota policy for low-storage devices.
- JWT revocation beyond short TTL.
- Publisher signing-key rotation.
- Accessibility scope for v1 launch.
- i18n strategy.
- Therapist-plugin key distribution and BAA surface.

## Related context

- *(none yet)*

## Links

- Memory log: [[../memory-log]]
- Related entities: *(none yet)*
