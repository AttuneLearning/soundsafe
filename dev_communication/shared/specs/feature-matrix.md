# Soundsafe — Feature Matrix

Master feature list × tier. This is the source of truth for what each tier includes. Changes to this document that affect scope should cite or create an ADR.

For the product-positioning question of *why Soundsafe exists given that AI sound/music generators are available*, see [differentiation.md](differentiation.md).

Legend:
- ✓ — feature available
- — — feature not available
- **fixed** — feature is on with non-tunable defaults
- **tunable** — feature is on with user-adjustable values (within safe bounds)
- *v2* — explicitly deferred to a later version
- *plugin* — delivered by the future therapist plugin, not the consumer app

## Tier summary

| Tier | Price point | Summary |
|---|---|---|
| **Free** | Free, anonymous | Entry experience. Curated previews, always-on safety, no account. |
| **Relaxation (Tier 2)** | Low-fee subscription | Passive playback of curated pre-built desensitization roadmaps and ambient / music packs. |
| **Interactive (Tier 3)** | Higher-fee subscription | User-built roadmaps, full transform library (including the extreme pitch-shift LFO and binaural beats), tunable safety settings, roadmap export. |
| **Therapist (future)** | Separate plugin / app, HIPAA + GDPR compliant | Client assignment, progress review, messaging. Not in v1. |

## Playback

| Feature | Free | Relaxation | Interactive | Therapist |
|---|---|---|---|---|
| Play curated preview samples | ✓ | ✓ | ✓ | *plugin* |
| Play full curated packs | — | ✓ | ✓ | *plugin* |
| Play curated pre-built roadmaps (Tier-2 content) | — | ✓ | ✓ | *plugin* |
| Build & save custom roadmaps | — | — | ✓ | *plugin* |
| Apply individual transforms ad-hoc | — | — | ✓ | *plugin* |
| Export / share roadmap JSON | — | — | ✓ | *plugin* |
| Offline playback of owned packs (72 h grace) | — | ✓ | ✓ | *plugin* |
| Resume a roadmap mid-step | ✓ | ✓ | ✓ | *plugin* |

## Safety controls (always on; values gated by tier — see ADR-015)

| Feature | Free | Relaxation | Interactive | Therapist |
|---|---|---|---|---|
| First-run disclaimer | ✓ | ✓ | ✓ | ✓ |
| Per-protocol "not a substitute for therapy" notice | ✓ | ✓ | ✓ | ✓ |
| Always-visible panic stop (~500 ms fade) | ✓ | ✓ | ✓ | ✓ |
| Panic-stop keyboard shortcut | ✓ | ✓ | ✓ | ✓ |
| Volume ceiling | **fixed** | **fixed** | **tunable** | *plugin* |
| Ramp-up window (silence → target on every play) | **fixed** | **fixed** | **tunable** | *plugin* |
| Daily per-trigger exposure cap | **fixed** | **fixed** | **tunable** | *plugin* |
| Cool-down timer between sessions | **fixed** | **fixed** | **tunable** | *plugin* |
| Grounding / safe-audio track (one-tap switch to calm content) | ✓ | ✓ | ✓ | ✓ |

**Starting-point defaults** (clinically validated 2026-04-20 by Adam, LPC):

| Value | Default | Notes |
|---|---|---|
| Volume ceiling | −12 dBFS peak at master output | Tunable in Tier 3 within safe bounds |
| Ramp-up window | 3.0 s | Tunable in Tier 3 |
| Daily exposure cap per trigger | 15 minutes cumulative | Tunable in Tier 3 |
| Cool-down between sessions on the same trigger | **10 minutes** | Tunable in Tier 3; slider snaps to 10-minute increments |
| Panic-stop fade-out | 500 ms | **Fixed** for safety (not user-tunable) |

## Transform library (see ADR-016)

Anchored in primitives from the exposure-therapy and auditory-therapy literature, plus two signature transforms.

| Transform | Evidence-based anchor | Free | Relaxation | Interactive | Therapist |
|---|---|---|---|---|---|
| Gain envelope / attenuation curve | Intensity reduction (primary lever) | preview only | pre-built | ✓ | *plugin* |
| Low-pass filter | Remove high-frequency startle | — | pre-built | ✓ | *plugin* |
| High-pass filter | Remove rumble / sub-bass pressure | — | pre-built | ✓ | *plugin* |
| Band-pass / parametric EQ | Target triggering frequency bands | — | pre-built | ✓ | *plugin* |
| Spectral softening (transient reducer) | Dampen percussive onsets | — | pre-built | ✓ | *plugin* |
| Pink-noise masking | Partial perceptual masking at controllable SNR | — | pre-built | ✓ | *plugin* |
| Time stretch (phase-vocoder) | Slow onsets; extend exposure without pitch shift | — | pre-built | ✓ | *plugin* |
| Reversal | Decouple from semantic anticipation | — | — | ✓ | *plugin* |
| Partial mute / zoning | Silence specific time windows | — | — | ✓ | *plugin* |
| **Extreme pitch-shift LFO** *(signature)* | De-naturalize the trigger beyond real-world range. Controls: **oscillation speed (Hz)**, **intensity (semitones ±, up to ±48)**, **duration (per-cycle or bounded)**. | — | pre-built presets | ✓ full control | *plugin* |
| **Binaural beats generator** | Real L/R sine oscillators. Controls: **carrier Hz**, **beat Δ Hz**, **blend level**. Layer under trigger or use standalone. | — | pre-built presets | ✓ full control | *plugin* |

All real-time transforms are sample-accurate and allocation-free in the audio callback. Non-real-time transforms (used only by `pack-tooling` for pre-rendered roadmap content) are not listed here.

## Roadmaps

A roadmap is an ordered sequence of steps. Each step is: one source sound + one or more transforms (with parameter values) + duration + an advance condition (timer, user-tap, or SUDS-threshold).

| Feature | Free | Relaxation | Interactive | Therapist |
|---|---|---|---|---|
| Play curated pre-built roadmaps | — | ✓ | ✓ | *plugin* |
| Build a new roadmap from scratch | — | — | ✓ | *plugin* |
| Branching roadmaps (conditional next-step) | — | — | *v2* | *plugin* |
| Adaptive roadmaps (auto-advance on physiological / self-report input) | — | — | *v2* | *plugin* |
| Save roadmap locally | — | — | ✓ | *plugin* |
| Export roadmap JSON | — | — | ✓ | *plugin* |
| Import roadmap JSON shared by another user | ✓ (play-only) | ✓ | ✓ | *plugin* |

**Distress rating (SUDS 0–10) during playback:**
- Free: not available.
- Relaxation: optional; rating is stored locally (ADR-011) and used only to decide step auto-advance when a curated roadmap uses a SUDS advance condition.
- Interactive: optional on every step; full local history in the session view.

## Content catalog — v1

All content delivered via encrypted packs (ADR-006, ADR-010). Packs are downloaded once and cached locally.

### Trigger packs

| Pack | Tier required | Sounds (initial) |
|---|---|---|
| **Starter (free)** | Free | Dog bark, baby crying, alarm clock, car horn, knocking |
| **Everyday Urban** | Relaxation | Siren, traffic, crowd, construction, leaf blower |
| **Domestic** | Relaxation | Smoke alarm, vacuum, blender, microwave beep, plumbing |
| **Misophonia set** | Relaxation | Chewing, slurping, pen-clicking, keyboard typing, sniffing (ships with extra content warnings) |

### Music / relaxation content packs (see ADR-017)

Music ships as **curated, pre-recorded packs** — there is no procedural or AI music generation in v1.

| Pack | Tier required | Content |
|---|---|---|
| **Ambient Beds** | Relaxation | 10 looping ambient tracks, 10–20 minutes each. |
| **Solfeggio** | Relaxation | 7 solfeggio-tuned instrumental beds. |
| **Instrumental Calm** | Relaxation | 6 piano / strings tracks for masking + relaxation. |
| **Binaural Overlays** | Relaxation | Recorded binaural-carrier layers tuned for masking use. (Separate from the Interactive tier's live binaural-beats *transform* — these are finished audio files.) |

User-supplied audio is out of scope in v1 (ADR-012).

## Accounts, sync, payment

| Feature | Free | Relaxation | Interactive | Therapist |
|---|---|---|---|---|
| Anonymous use | ✓ | — | — | — |
| Account required | — | ✓ (at checkout) | ✓ (at checkout) | *plugin* |
| Email + password sign-in | — | ✓ | ✓ | *plugin* |
| Magic-link sign-in | — | ✓ | ✓ | *plugin* |
| Stripe subscription | — | ✓ | ✓ | *plugin* |
| Manage subscription in-app | — | ✓ | ✓ | *plugin* |
| Saved roadmaps (local) | — (session-only) | ✓ | ✓ | *plugin* |
| Cross-device sync | — | — | *v2* | *plugin* |
| Data export (user's local data) | — | ✓ | ✓ | *plugin* |
| Data deletion (GDPR right to erasure) | N/A (no server data) | ✓ | ✓ | *plugin* |

## Accessibility (baseline for v1; full scope tracked as GAP-006)

| Feature | Free | Relaxation | Interactive | Therapist |
|---|---|---|---|---|
| Full keyboard navigation | ✓ | ✓ | ✓ | *plugin* |
| Visible focus outlines | ✓ | ✓ | ✓ | *plugin* |
| Screen-reader labels on controls | ✓ | ✓ | ✓ | *plugin* |
| Reduced-motion support | ✓ | ✓ | ✓ | *plugin* |
| Caption / visual alternative for deaf / HoH users | *v2* | *v2* | *v2* | *plugin* |
| High-contrast theme | *v2* | *v2* | *v2* | *plugin* |

## Out of scope for v1 (explicit)

- Therapist-facing features (assignment, messaging, progress review, client linkage) — delivered by the future plugin. See ADR-003, ADR-004.
- User-recorded / user-uploaded audio. See ADR-012.
- Cross-device sync. See ADR-011.
- Native desktop or mobile apps. See ADR-001.
- Procedural / AI music generation. See ADR-017.
- Branching and adaptive roadmaps.
- Social sharing infrastructure (beyond roadmap-JSON export).
- Localization / i18n (English only for v1).

---

Back to [architecture index](../architecture/index.md).
