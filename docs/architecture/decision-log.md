# Decision Log

Chronological list of architecture decisions. Each row links to the full ADR.

| ID | Date | Title | Status | Domain |
|---|---|---|---|---|
| ADR-001 | 2026-04-19 | [Platform target: Web/PWA for MVP](decisions/ADR-001-platform-target-web-pwa.md) | Accepted | Platform |
| ADR-002 | 2026-04-19 | [UI framework: React + TypeScript + wasm-bindgen](decisions/ADR-002-ui-framework-react-wasm-bindgen.md) | Accepted | Frontend |
| ADR-003 | 2026-04-19 | [No PHI in consumer app](decisions/ADR-003-no-phi-consumer-app.md) | Accepted | Data / Compliance |
| ADR-004 | 2026-04-19 | [Therapist tier deferred to compliant plugin](decisions/ADR-004-therapist-tier-deferred.md) | Accepted | Scope |
| ADR-005 | 2026-04-19 | [Monorepo with pnpm + Cargo workspaces](decisions/ADR-005-monorepo-workspaces.md) | Accepted | Repo |
| ADR-006 | 2026-04-19 | [CDN + encrypted packs + serverless key endpoint](decisions/ADR-006-cdn-encrypted-packs.md) | Accepted | Backend |
| ADR-007 | 2026-04-19 | [Freemium via Stripe + signed-JWT entitlements](decisions/ADR-007-freemium-stripe-jwt.md) | Accepted | Monetization |
| ADR-008 | 2026-04-19 | [Tier 2 passive; Tier 3 user-built](decisions/ADR-008-tier-split.md) | Accepted | Product |
| ADR-009 | 2026-04-19 | [Anonymous free tier; account only for paid](decisions/ADR-009-account-model.md) | Accepted | Identity |
| ADR-010 | 2026-04-19 | [Per-pack AES-256-GCM key delivered after JWT check](decisions/ADR-010-pack-encryption.md) | Accepted | Security |
| ADR-011 | 2026-04-19 | [Local-only progress (IndexedDB + OPFS)](decisions/ADR-011-local-only-progress.md) | Accepted | Storage |
| ADR-012 | 2026-04-19 | [No user audio upload in v1](decisions/ADR-012-no-user-audio-v1.md) | Accepted | Scope |
| ADR-013 | 2026-04-19 | [Product name: Soundsafe](decisions/ADR-013-product-name.md) | Accepted | Product |
| ADR-014 | 2026-04-19 | [Memory + ADR skills via ai_team_config submodule](decisions/ADR-014-memory-adr-skills.md) | Accepted | Tooling |
| ADR-015 | 2026-04-19 | [Safety posture: disclaimer + panic + ceiling + caps](decisions/ADR-015-safety-posture.md) | Accepted | Safety |
| ADR-016 | 2026-04-19 | [Transform library: research-driven + signature transforms](decisions/ADR-016-transform-library.md) | Accepted | Audio |
| ADR-017 | 2026-04-19 | [Music ships as curated packs in v1; no generation](decisions/ADR-017-music-packs-not-generation.md) | Accepted | Content |
| ADR-018 | 2026-04-20 | [TDD as default; Rust + TS test stack](decisions/ADR-018-tdd-test-strategy.md) | Accepted | Tooling |

---

Back to [architecture index](index.md).
