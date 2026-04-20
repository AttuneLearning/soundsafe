# ADR-015: Safety posture — disclaimer + panic + ceiling + caps

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Safety

## Context

Soundsafe is a graduated-exposure tool for sounds that, by design, users find distressing. Exposure that is too loud, too sudden, too long, or too frequent can be counterproductive or harmful — particularly for trauma-related triggers. Consumer self-guided use (no therapist oversight in v1, per ADR-004) raises the baseline duty of care: the product itself must enforce sensible limits.

## Decision

Four safety layers are **always enabled** in all tiers:

1. **First-run disclaimer** + a per-protocol "not a substitute for therapy" notice on every roadmap start. Acknowledged before playback begins.
2. **Always-visible panic-stop** control. Pressing it performs a ~500 ms fade-to-silence and halts the roadmap. Bound to a keyboard shortcut.
3. **Hard volume ceiling + gradual ramp-up** on every play. Every playback starts at silence and ramps to the target level over a configurable window (default: 3 seconds). Maximum output gain is capped at a safe level.
4. **Daily exposure cap + cool-down timer** between sessions. A per-trigger daily cumulative exposure limit and a cool-down period enforced by the app. Exceeding them blocks playback until reset.

**Tier gating of *values*** (not of whether the layers exist):
- **Free** and **Relaxation (Tier 2):** fixed sensible defaults. Users cannot change the ceiling, ramp window, daily cap, or cool-down.
- **Interactive (Tier 3):** the ceiling, ramp window, daily cap, and cool-down become tunable within safe bounds.
- The disclaimer and panic-stop are **always on at every tier**, never user-disabled.

## Consequences

### Positive
- Every user, at every tier, gets meaningful safety rails from the first press of Play.
- Panic-stop and disclaimer being non-tunable removes the failure mode where a user disables the safety layer they most need.
- Tier-3 tunability gives advanced users flexibility without removing core protections.

### Negative / trade-offs
- Adds persistent state (cool-down timers, daily totals) even in Tier 1. Stored locally per ADR-011.
- Some Tier 3 users will want to disable the ceiling entirely. The "tunable within safe bounds" constraint is deliberate and will frustrate a small minority.

### Neutral / to watch
- The exact default values (ramp window, ceiling dB, daily cap minutes, cool-down minutes) should be informed by the clinical literature and refined with user testing. Starting-point defaults live in the feature matrix.

## Alternatives considered

- **Safety rails as an opt-in feature.** Rejected: defeats their purpose.
- **Panic-stop as a keyboard shortcut only (no visible button).** Rejected: many users won't know or remember the shortcut under distress.
- **Session caps only in therapist-assigned tier.** Rejected: self-guided use needs them *more*, not less.

## References

- Related ADRs: ADR-004 (self-guided posture), ADR-008 (tier split), ADR-011 (local state for safety counters).
- `docs/product/feature-matrix.md` has the full per-tier table including default values.
