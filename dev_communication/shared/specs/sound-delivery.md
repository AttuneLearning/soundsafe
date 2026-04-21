# Sound Delivery Architecture

Status: Draft v1 (bootstrap). Maintained alongside the ADRs it depends on. Changes that affect this doc should cite or create an ADR.

## 1. System overview

```
┌──────────────────┐       1. fetch manifest            ┌──────────────────────────┐
│   Browser / PWA  │ ─────────────────────────────────▶ │ DigitalOcean Spaces CDN  │
│   (React + WASM) │ ◀───────────────────────────────── │  - pack-v{N}.zip (enc)   │
│                  │       2. fetch encrypted pack      │  - manifest.json         │
│                  │                                    │  - signature.ed25519     │
│                  │                                    │  - latest.json           │
│                  │                                    └──────────────────────────┘
│                  │
│                  │       3. POST /entitlement (JWT)   ┌──────────────────────────┐
│                  │ ─────────────────────────────────▶ │ Serverless key endpoint  │
│                  │ ◀───────────────────────────────── │  - verify JWT (RS256)    │
│                  │       4. pack key                  │  - lookup pack key       │
│                  │                                    │  - return key            │
│                  │                                    └──────────────────────────┘
│                  │
│                  │       5. Stripe checkout (paid)    ┌──────────────────────────┐
│                  │ ─────────────────────────────────▶ │ Stripe + JWT issuer      │
│                  │ ◀───────────────────────────────── │  - webhook mints JWT     │
└──────────────────┘       6. entitlement JWT           └──────────────────────────┘
```

**Parties:**

- **Browser / PWA** — React + TypeScript UI, Rust core compiled to WASM via `wasm-pack`.
- **DigitalOcean Spaces + CDN** — object storage for encrypted packs, signed manifests, and a small `latest.json` version index.
- **Serverless key/entitlement endpoint** — Cloudflare Worker or DigitalOcean Function. Verifies entitlement JWTs, returns pack decryption keys.
- **Stripe + JWT issuer** — Stripe Checkout handles payments; a Stripe-webhook receiver mints short-lived signed JWTs representing the user's entitlement scope.

No long-running server is operated by Soundsafe for v1. See ADR-006.

## 2. Pack format

A pack is a zipped directory. Inside:

```
pack-<family>-v<version>/
├── manifest.json          # pack metadata, file list, per-file nonces, per-file auth tags
├── signature.ed25519      # Ed25519 signature over manifest.json
├── audio/
│   ├── 00-intro.opus.enc
│   ├── 01-trigger.opus.enc
│   └── ...                # AES-256-GCM encrypted Opus (or FLAC for finale)
├── presets/
│   ├── roadmap-1.json     # pre-built roadmap definitions (Tier 2 content)
│   └── ...
└── art/
    └── cover.webp
```

### Audio codecs

- **Default:** Opus 48 kHz, 96–128 kbps. Perceptually strong at low bitrates; excellent for speech-and-environmental content.
- **Roadmap "finale" / reference tracks:** optional FLAC for lossless, used when the final step of a roadmap is the raw unmodified trigger and fidelity matters for generalization.

### Encryption (see ADR-010)

- Each pack has a unique random **AES-256-GCM** key (256 bits).
- Each file has a unique random 96-bit nonce, stored in `manifest.json`.
- Each file has its 128-bit GCM auth tag stored in `manifest.json`.
- No key material lives on the CDN.

### Signing

- `manifest.json` is signed with an **Ed25519** publisher key; `signature.ed25519` is a detached signature.
- The public key is bundled with the client (and versioned — see GAP-005 for rotation).
- The client verifies the manifest signature **before trusting any value from inside the manifest** (including the auth tags and nonces).

### Manifest shape (informal)

```json
{
  "pack_id": "misophonia-core",
  "version": "2026-04-19.1",
  "min_app_version": "0.1.0",
  "tier_required": "relaxation",
  "files": [
    {
      "path": "audio/01-chewing.opus.enc",
      "nonce": "base64(12 bytes)",
      "tag": "base64(16 bytes)",
      "sha256": "base64(32 bytes)",
      "duration_ms": 8500,
      "label": "Chewing — baseline"
    }
  ],
  "roadmaps": [
    { "id": "roadmap-1", "steps": [ ... ] }
  ],
  "content_warnings": ["food sounds", "misophonia"]
}
```

The `sha256` is over the *ciphertext* (enabling integrity checks before decryption). The GCM `tag` is the authentication tag produced during encryption; it authenticates the plaintext.

## 3. Key and entitlement flow

### Entitlement issuance

1. User completes Stripe Checkout.
2. Stripe fires a webhook to the JWT issuer function.
3. The issuer signs a short-lived RS256 JWT:
   ```
   {
     "sub": "stripe_customer_id",
     "scope": ["tier:interactive", "pack:misophonia-core", "pack:urban-core"],
     "iat": 1745000000,
     "exp": 1745003600,  // ~1 hour
     "iss": "soundsafe-issuer",
     "jti": "..."
   }
   ```
4. The client stores the JWT and a long-lived refresh token in IndexedDB. Refresh is a separate endpoint.

### Playback key request

1. Client needs to play `pack:misophonia-core`.
2. Client POSTs to `/entitlement` with its JWT and the requested pack ID.
3. Worker validates the JWT signature against the JWKS, confirms the pack ID is within `scope`, and returns the pack key (`{ pack_key: "base64(32 bytes)" }`).
4. Client loads the pack key into WASM linear memory and begins decryption.

### Key hygiene

- Pack keys are held **only in WASM linear memory** for the session. The JS heap never sees raw key bytes after the initial handoff into WASM.
- Keys are zeroed on: pack unload, tab visibility change to hidden (optional), session end.
- Keys are never written to storage. A pack re-opened later will re-fetch the key.

### Revocation

- Short JWT TTL (hours) bounds revocation latency.
- Refund / subscription lapse: the refresh endpoint refuses to issue new JWTs. Existing JWTs expire naturally.
- A denylist in the Worker is **a future option** (GAP-003), not implemented in v1.

## 4. Caching strategy

Three caches with different lifetimes:

| Layer | Stores | Lifetime | Evicted when |
|---|---|---|---|
| Cache API (Service Worker) | Encrypted pack blobs (HTTP responses) | Long; keyed by versioned URL (`pack-v<version>.zip`) | Pack version changes; user clears site data |
| IndexedDB | Manifest, parsed metadata, roadmaps, user progress, JWT, refresh token | Long | User signs out / clears site data |
| OPFS | Decrypted PCM chunks for installed packs (bulk-decrypted at pack load) | Long; persists across sessions to support 72-hour offline grace | Pack unload, user clears site data, LRU cap exceeded |

Decrypted audio never touches the Cache API or IndexedDB. See ADR-011.

**Size caps (defaults):**
- OPFS: **1 GB total decrypted audio, user-configurable** (min 200 MB, max 4 GB). LRU eviction only when the cap is reached — no eviction on tab close, visibility change, or backgrounding. The persistent cache preserves the 72-hour offline grace (§6) without re-decrypt churn in normal multi-session Tier-3 use.
- Cache API: no explicit Soundsafe cap; browser-managed quota.

**Filename obfuscation (ADR-025).** OPFS files are stored under opaque v4-UUID names with no file extensions, inside UUID-named per-pack directories. A mapping table in IndexedDB (`opfs_index`: `{ packId, soundId, uuid, sha256, bytes }`) resolves `soundId → handle` at playback time. Purpose: defeat casual disk-level inspection of the browser profile, not defeat an in-session attacker (who has full origin access by design). See `content-protection.md` for the full posture.

**Escape-by-URL disallowed (ADR-025).** Decrypted OPFS handles are never converted to `URL.createObjectURL` or any other URL-addressable form. Enforced as a lint rule in the codebase. Audio flows OPFS → `ReadableStream` → WASM linear memory → AudioWorklet output → Web Audio destination, with no point at which "save as" / drag-out / `<a download>` is reachable.

Policies for OPFS exhaustion under low-storage devices are tracked as GAP-002.

## 5. Update channel

### Content updates

- `latest.json` on the CDN lists the current version for each pack:
  ```json
  {
    "packs": { "starter": "2026-04-19.1", "misophonia-core": "2026-04-18.2" },
    "min_app_version": "0.1.0",
    "generated_at": "2026-04-19T22:00:00Z"
  }
  ```
- Short TTL (60 s) on `latest.json`; long TTL (~1 day) on versioned `pack-v<version>.zip`.
- On launch (and periodically while active), the client fetches `latest.json`, compares with its cached manifests, and offers updates.

### App updates

- The consumer app is a standard Vite-built PWA.
- A Service Worker manages the app shell with skip-waiting and a "reload to update" prompt.
- `min_app_version` in `latest.json` allows the server to require an app update before allowing access to a newer pack version.

Detailed SW update UX is tracked as GAP-004.

## 6. Offline mode

### First-time access

To play a pack the first time, the client must reach the key endpoint. If offline, playback is blocked with a clear message.

### Established access — grace window

Once a pack key has been successfully fetched and the pack has been decrypted at least once in this session or a recent one:

- The client records a timestamp (`last_verified_at`) per pack in IndexedDB.
- For up to **72 hours** after `last_verified_at`, the pack plays offline without re-contacting the key endpoint. Pack keys are not persisted; the client re-derives a session key from an in-memory cached copy if the tab hasn't been closed, or re-requests the key opportunistically when online.
- After 72 hours offline, the client requires a re-verification before further playback.

This policy is a placeholder: numeric defaults and the exact persistence semantics should be revisited with real usage data.

### Why 72 hours

- Long enough to cover a weekend away from internet (travel, outages).
- Short enough that refunded / lapsed subscriptions lose access within a reasonable window.
- Does not interact with PHI because no PHI exists in the consumer app (ADR-003).

## 7. Threat model

See also [`content-protection.md`](content-protection.md) for the publisher-facing framing of this posture: what Soundsafe does protect against, what it accepts as out-of-scope (analog hole, DevTools, extensions, memory forensics), and why the posture is proportional to curated therapeutic audio content.

| Threat | Mitigation | Residual risk |
|---|---|---|
| CDN URL leakage → content extraction | Per-pack AES-256-GCM encryption (ADR-010) | Determined attacker with a running legit session can extract in-memory keys. Accepted. |
| Casual disk-level inspection of cached decrypted audio | OPFS filename obfuscation (UUIDs, no extensions); no URL-addressable handles (ADR-025) | Defeats filesystem browsing; does not defeat origin-scoped JS or DevTools. Accepted. |
| Stolen entitlement JWT replayed from another device | Short TTL, refresh-token flow, scope-based validation | Within the TTL window, a stolen JWT is usable. Acceptable for low-value content. |
| Modified manifest served by a compromised CDN origin | Ed25519 signature check before trusting manifest | Compromise of the publisher signing key defeats this. Publisher key is offline-held. |
| Replay of encrypted files with swapped nonces | GCM auth tag binds ciphertext ↔ key ↔ nonce | Any tampering fails the tag check. |
| Malicious pack content (audio that is itself harmful) | Manual curation of packs; content warnings in manifest | Human review is the control; no automated content scanning. |
| PHI leakage | No PHI in v1 per ADR-003 | Therapist plugin must have its own threat model. |
| Local key-extraction via dev tools or extensions | Keys only in WASM memory; no raw keys on JS heap after handoff | A malicious browser extension with page access can read WASM memory. Accepted. |
| Downgrade attack on JWT algorithm | Verifier hardcodes RS256; rejects `alg: none` and HS* | — |
| Refund-fraud exploitation | Short JWT TTL limits post-refund access to ~1 hour | Account-level denylist is a future enhancement (GAP-003). |

## 8. Therapist-plugin extension points (for v2+)

v1 ships no therapist code, but several seams are reserved so the plugin can attach cleanly later.

### `AssignmentProvider` (TS interface, in `ui-kit`)

```ts
interface AssignmentProvider {
  listAssignedRoadmaps(): Promise<RoadmapSummary[]>;
  fetchRoadmap(id: string): Promise<Roadmap>;
  markStepComplete(assignmentId: string, stepIndex: number): Promise<void>;
}
```

v1 ships a no-op implementation. The therapist plugin replaces it with one that talks to the plugin's compliant backend.

### `ProgressSink` (TS interface, in `ui-kit`)

```ts
interface ProgressSink {
  recordStepStarted(roadmapId: string, stepIndex: number): void;
  recordStepCompleted(roadmapId: string, stepIndex: number, rating?: number): void;
  recordPanicStop(roadmapId: string, stepIndex: number): void;
}
```

v1 has a single local sink that writes only to IndexedDB (ADR-011). The plugin can install an additional encrypted-export sink that emits clinical records to the therapist's compliant stack.

### Shared `rust-core` API stability

- Transform parameter JSON is a stable contract: roadmaps authored in v1 must play identically in v2.
- Adding new transforms: additive only; never change a parameter name or remove an existing transform without a deprecation path.
- Pack-manifest schema reserves fields (`therapist.*`) for plugin-authored content; v1 clients ignore them.

## 9. Out of scope for v1 (explicit)

- **PHI, clinical data, therapist↔client linkage.** See ADR-003, ADR-004.
- **User-recorded or user-uploaded audio.** See ADR-012.
- **Cross-device progress sync.** See ADR-011.
- **Mobile / desktop native shells.** See ADR-001. The repo layout reserves slots.
- **Procedural / AI music generation.** See ADR-017.
- **Browser-native DRM (EME/Widevine).** See ADR-006.
- **Long-running backend service.** See ADR-006.
- **Accessibility scope beyond keyboard + basic screen-reader labels.** Dedicated a11y pass scheduled pre-launch (GAP-006).

## 10. Open questions

Tracked in [gaps/index.md](gaps/index.md). Active items as of this doc:

- **GAP-001** Real-time audio-graph boundary between Web Audio and Rust/WASM.
- **GAP-002** OPFS quota exhaustion policy.
- **GAP-003** JWT revocation strategy beyond short TTL.
- **GAP-004** Service Worker update UX.
- **GAP-005** Publisher signing-key rotation.
- **GAP-006** Accessibility scope for v1 launch.
- **GAP-007** i18n / localization strategy.
- **GAP-008** Therapist-plugin key distribution and BAA surface.
