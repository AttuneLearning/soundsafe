# Differentiation: Soundsafe vs. AI-generated sound tracks

A user could plausibly ask an AI music or sound-effect generator (Suno, Udio, ElevenLabs, etc.) to produce a graduated desensitization track — something like "a barking dog sound, starting faint and slow, getting louder over two minutes." Why build Soundsafe instead?

The differences are not cosmetic. They are the reasons the product exists.

## The short version

**AI generators produce *new sounds*. Soundsafe controllably modifies *the sound the client is actually afraid of*.** That is the therapeutic primitive.

## The list

- **Fidelity to the actual trigger.** Exposure therapy works because the client habituates to *this* stimulus — the real barking-dog sound, the real siren, the real chewing. Soundsafe transforms a curated recording of the real thing. An AI generator produces something "like" a barking dog; the client trains against the model's hallucination, and generalization to the real-world stimulus is weaker.

- **Habituation requires the same stimulus across sessions.** Re-prompting an AI generator yields a slightly different track every time. Deterministic transforms over a fixed source give the client the *same* sound with controlled modifications — which is what the clinical model assumes.

- **Real-time parametric control.** The Interactive tier lets users dial oscillation speed, intensity, ceiling, and ramp-up *during playback*. An AI-generated file is fixed at generation time; once it's rendered, you cannot reach in and tweak the low-pass frequency mid-session.

- **Transparent, composable, reproducible DSP.** "Low-pass 1 kHz → reversal → pitch-LFO at 1.2 Hz, ±18 semitones" is a specification a therapist can inspect, share, adjust, and reproduce. A prompt is not. When a roadmap works for a client, we can say *exactly* what worked and copy it forward.

- **Safety rails.** Panic-stop with ~500 ms fade, volume ceiling, ramp-up on every play, daily exposure caps, cool-down timers. An AI generator hands you an audio file; Soundsafe ships the container that keeps exposure from harming the user.

- **Privacy.** Processing is local WASM. No audio, no prompts, no progress leave the device. AI generators are cloud APIs; prompts and any supplied audio can be retained by the vendor. For the future therapist tier (HIPAA + GDPR), that gap is disqualifying.

- **Offline.** After pack download, Soundsafe works fully offline. AI-generated tracks imply a recurring round-trip to the vendor's API — network dependency, latency, and per-generation cost for the user or for us.

- **Provenance.** Curated packs have known recording origin, reviewed content, and cleared licensing. AI output has murky training-data lineage — a real issue once the therapist track ships and commercial-clinical use comes into scope.

- **Clinical story.** Every transform in the library maps to a primitive from the exposure-therapy and auditory-therapy literature — intensity reduction, spectral masking, time stretch, transient reduction. See [ADR-016](../architecture/decisions/ADR-016-transform-library.md). That is the language the future therapist plugin will need to sell into clinics and insurers. "We prompted a model" is not that language.

- **Composability over time.** A Tier-3 user's saved roadmap is a small JSON document that will play identically next year. Generated tracks go stale whenever the generator changes, rate-limits, or goes offline.

## Where AI generation *does* fit

Not here in v1, but worth naming so future scope discussions are grounded:

- **Music / relaxation beds** — in principle, procedural or AI-generated ambient music is a plausible v2+ feature, as a *supplement* to curated music packs. It would not replace the trigger-transformation core. Decision tracked in [ADR-017](../architecture/decisions/ADR-017-music-packs-not-generation.md).
- **Pack authoring assistance** — internally, AI tools may help label, tag, or pre-process curated recordings. That is a content-ops workflow question, not a runtime feature.
- **Accessibility / description generation** — written descriptions of trigger sounds for screen readers is a reasonable candidate for authoring-time AI assistance.

In all of those cases, the runtime audio the client hears during exposure work is still a known, curated, controllably transformed recording. The generated-audio path does not enter the exposure loop itself.

---

Back to [feature matrix](feature-matrix.md) · [architecture index](../architecture/index.md).
