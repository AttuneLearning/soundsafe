# Architecture Gaps

Unresolved architectural questions that should eventually become ADRs. Each gap captures *what is undecided* and *why it matters*, so it doesn't silently drift.

| ID | Priority | Domain | Question | Notes |
|---|---|---|---|---|
| GAP-001 | Medium | Audio | What's the real-time audio graph boundary between Web Audio API and Rust/WASM? | Affects latency budget and whether transforms are sample-accurate. Revisit after rust-core prototype. |
| GAP-002 | Medium | Storage | OPFS quota exhaustion policy for cached decrypted segments. | Small devices may evict aggressively. Need a cap + eviction order. |
| GAP-003 | High | Security | JWT entitlement revocation strategy after refund / subscription lapse. | Currently relies on short JWT TTL; may need a revocation list or key rotation. |
| GAP-004 | Medium | Platform | Service Worker update flow and offline-first pack access when app-shell updates. | Needs a reload/notify UX spec. |
| GAP-005 | Medium | Content | Pack publisher signing key custody and rotation. | Currently "one bundled public key"; need a rotation path without breaking existing packs. |
| GAP-006 | Medium | Accessibility | Detailed a11y scope for v1 (screen reader, keyboard, reduced motion, caption alternatives for deaf/HoH users). | Out-of-scope for MVP sketch; must be nailed down before launch. |
| GAP-007 | Low | Product | Localization / i18n strategy. | English-only for v1, but deferring the decision means retrofits are costlier. |
| GAP-008 | High | Compliance | When the therapist plugin arrives, how does it obtain per-client keys and what is the BAA surface? | Tracked so the v1 architecture doesn't foreclose it. |

---

Back to [architecture index](../index.md).
