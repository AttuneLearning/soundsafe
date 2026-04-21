# ADR-025: Content protection posture — defend casual disk extraction, accept in-session extraction

**Status:** Accepted
**Date:** 2026-04-20
**Domain:** Security

## Context

v1 ships encrypted-at-rest packs (ADR-006, ADR-010) that the client decrypts on-device for playback. To support the 72-hour offline grace window (ADR-011) and responsive multi-pack Tier-3 workflows, decrypted audio is bulk-cached in OPFS.

Three extraction-threat classes bear on this:

1. **Casual disk-level inspection** — someone browses the browser profile directory on a shared computer, a lost laptop, or a forensic-curious family member. They see file names and directory structures on disk.
2. **In-session extraction** — a user opens DevTools, inspects OPFS via the FileSystemAccess API, and downloads decrypted audio. Or a browser extension with page-level permissions does this invisibly.
3. **The analog hole** — OS-level recording (Audacity loopback, OBS) captures the audio as it plays. Also: `MediaRecorder` on a `MediaStreamAudioDestinationNode`. Universal to any browser audio app.

Class (3) is impossible to defend against. Class (2) is impossible to defend against in any meaningful way on an open browser platform — origin-scoped JS has full OPFS access by design. Class (1) is where Soundsafe has actual design leverage.

The question: how hard should v1 try? A Soundsafe with zero on-disk footprint (streaming decrypt in the worklet) would close class (1) but cost real-time-audio complexity and CPU. A Soundsafe that dumps `misophonia-core/chewing-baseline.opus.pcm` onto disk costs nothing but reveals everything to class (1).

## Decision

**Defend against casual disk-level extraction. Explicitly accept in-session extraction, the analog hole, and memory forensics.**

### Defences in v1

1. **OPFS filename obfuscation.** Each decrypted file is stored under an opaque v4-UUID name with no extension, inside a UUID-named per-pack directory. A mapping table in IndexedDB (`opfs_index: { packId, soundId, uuid, sha256, bytes }`) resolves `soundId → handle` at playback time. A disk-level view sees only opaque UUID-named files; nothing reveals which packs or sounds a user has cached.
2. **No URL-addressable handles.** `URL.createObjectURL` is forbidden on any value that flows from an OPFS `FileSystemFileHandle`. Enforced as a lint rule (ESLint `no-restricted-syntax` on `URL.createObjectURL` with an OPFS-derived argument). Decrypted audio flows OPFS → `ReadableStream` → WASM linear memory → AudioWorklet output → Web Audio destination and never becomes a URL-addressable resource. "Save as…", drag-out, `<a download>`, and right-click "Save audio as" are therefore not reachable.
3. **No automatic eviction on idle.** OPFS contents persist across tab close, visibility change, and backgrounding. The only eviction mechanism is LRU at the user-configured cap (default 1 GB, min 200 MB, max 4 GB — see `sound-delivery.md §4`). This preserves the 72-hour offline grace and avoids re-decrypt churn in normal use.
4. **Publisher-facing guidance.** A dedicated document (`specs/content-protection.md`) explains to licensors what Soundsafe does and does not protect against, setting expectations before a licensing conversation begins.
5. **In-product notice.** The first-run disclaimer includes a short notice acknowledging that pack content is licensed for in-app use only (not a technical control; a legal/expectation framing).

### Accepted risks

- OS-level audio recording (Audacity loopback, OBS, system audio capture): universal browser-audio limitation.
- DevTools / JS-console extraction by the user on their own device: any origin-scoped JS has OPFS access by design.
- Browser extensions with page-level permissions: inherit origin access.
- Memory forensics (heap dumps): decoded audio transits linear memory; we minimize the window but cannot eliminate it.
- Root/admin access to the browser profile: outside the threat model for any browser app.

These are documented in `sound-delivery.md §7` and in `specs/content-protection.md`.

## Consequences

### Positive
- On-disk inspection of a Soundsafe profile reveals no meaningful metadata about content.
- Casual copy/save workflows (right-click save, drag-out) are unavailable.
- Implementation is simple: UUID-naming at the `pack-client` level, one lint rule, one mapping table. No real-time-audio complexity added.
- The 72-hour offline grace works naturally — decrypted audio persists across sessions.
- Publisher conversations have a shared framing document.

### Negative / trade-offs
- Not suitable for publishers who require "no plaintext on disk, period." Those publishers should not license to Soundsafe. `content-protection.md` makes this explicit up front.
- A determined technical user with their own device will still extract content. Accepted.
- Lint rule must be maintained: any new API that returns a Blob-like wrapper around OPFS must be audited for URL-addressability.

### Neutral / to watch
- A **reserved architectural seam** exists for streaming decrypt in the worklet (ADR-020) — the pack key transits worker→worklet via a dedicated SAB region rather than bulk-decrypting to OPFS. Adopting it removes on-disk plaintext entirely but adds real-time-audio complexity and re-decrypt CPU. The seam is not exercised in v1 but is available if a future content deal requires it.
- If the `opfs_index` table is ever leaked via a log, a debug tool, or an export, the obfuscation is defeated for the user whose index was leaked. Keep it out of telemetry and error reports.
- The ESLint rule cannot cover every possible way to construct an object URL (e.g., via `new Blob([await handle.getFile().arrayBuffer()])` laundered through an intermediate). Document the rule's intent in the `pack-client` README so reviewers catch novel routes.

## Alternatives considered

- **Streaming decrypt in the worklet (no on-disk plaintext).** Rejected for v1: real-time-audio complexity, key-in-audio-thread concerns, and the CPU cost of re-decrypting on every play would be paid on every session for a threat model that `content-protection.md` explicitly scopes out.
- **OPFS-at-rest encryption with a session key.** Rejected: an in-session attacker has JS access and can read both the ciphertext and the session key. Provides no marginal benefit over plain obfuscation against any threat except a disk-snapshot-with-no-browser-session — which is a narrow enough slice of class (1) to not justify the complexity.
- **EME / Widevine.** Already rejected in ADR-006 for cost, offline incompatibility, minority-browser failures, and overkill for therapeutic audio content.
- **Evict OPFS on tab close / visibility change.** Rejected per the user-confirmed direction: breaks 72-hour offline grace in normal use, and eviction on idle closes a window that was already closed by the on-disk obfuscation.

## References

- ADR-001 (Web/PWA for MVP)
- ADR-003 (no PHI in consumer app)
- ADR-006 (CDN + encrypted packs; EME rejected)
- ADR-007 (Stripe + JWT entitlements)
- ADR-010 (per-pack AES-256-GCM; keys in WASM linear memory)
- ADR-011 (local-only progress; 72-hour offline grace)
- ADR-020 (WASM thread topology; reserved streaming-decrypt seam)
- `sound-delivery.md §4` (OPFS caching policy); `§7` (threat model)
- `specs/content-protection.md` (publisher-facing guidance)
- Plan: `/home/adam/.claude/plans/distributed-napping-lemon.md` §Content protection posture
