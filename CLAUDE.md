# Soundsafe — Claude Code Instructions

Soundsafe is a sound-desensitization PWA. Users pick an environmental trigger (dog bark, siren, crying baby, chewing, etc.), apply a chain of audio transforms that reduce its triggering intensity, and step through a graduated "roadmap" from a heavily modified version toward the raw sound.

## Scope of this repo (v1)

**Consumer MVP only.** Public tiers 1–3: Free, Relaxation, Interactive. **No PHI, no therapist features in v1.** Therapist-facing work (assignment, messaging, progress review, client linkage) is deferred to a future HIPAA + GDPR-compliant plugin or second app; the architecture reserves seams for it but ships nothing clinical in v1.

## Canonical docs

| Document | Path |
|---|---|
| Sound-delivery architecture | `docs/architecture/sound-delivery.md` |
| Master feature matrix (tiers) | `docs/product/feature-matrix.md` |
| Architecture index | `docs/architecture/index.md` |
| ADR decision log | `docs/architecture/decision-log.md` |
| Bootstrap plan | `/home/adam/.claude/plans/cached-wishing-iverson.md` |

## Locked architectural decisions (summary)

See `docs/architecture/decisions/` for full ADRs. Quick index:

- **ADR-001** Web/PWA for MVP; Tauri/mobile later.
- **ADR-002** React + TypeScript + `wasm-bindgen`.
- **ADR-003** No PHI in consumer app.
- **ADR-004** Therapist tier deferred to compliant plugin/app.
- **ADR-005** Monorepo (pnpm + Cargo workspaces).
- **ADR-006** DigitalOcean Spaces CDN + encrypted packs + serverless key endpoint.
- **ADR-007** Freemium via Stripe + signed-JWT entitlements.
- **ADR-008** Tier 2 = passive; Tier 3 = user-built.
- **ADR-009** Anonymous free; account only for paid.
- **ADR-010** Per-pack AES-256-GCM, key delivered after JWT check.
- **ADR-011** Local-only progress (IndexedDB + OPFS).
- **ADR-012** No user audio upload in v1.
- **ADR-013** Product name: Soundsafe.
- **ADR-014** `/memory` + `/adr` skills via `ai_team_config` submodule (ADR path made project-local).
- **ADR-015** Safety posture: disclaimer + panic-stop + volume ceiling + caps; tunable only above free.
- **ADR-016** Research-driven transforms + signature "extreme pitch-shift LFO" + binaural-beats generator.
- **ADR-017** Music ships as curated packs in v1; no procedural/AI generation.
- **ADR-018** TDD by default; `cargo nextest` + `bacon` + `proptest` (Rust), Vitest + Playwright (TS); `wasm-bindgen-test` reserved for boundary.

## Design principles (BLOCKING)

1. **No PHI in consumer code paths.** If a feature handles anything that links a named individual to clinical state, it belongs in the future therapist plugin, not here.
2. **Local-first.** Free tier needs no account, no network beyond initial pack download and entitlement check.
3. **Safety rails are always on.** First-run disclaimer, panic-stop, volume ceiling, and ramp-up are non-negotiable at every tier. Only their *values* become tunable in the Interactive tier.
4. **Ideal design, no compatibility shims.** New fields are `T | null` (always present, nullable), never `T?`. When a shape changes, update all callers — don't add shims.

## Skills

| Skill | Purpose |
|---|---|
| `/memory` | Manage the extended memory vault at `memory/`. |
| `/adr` | Manage ADRs at `docs/architecture/`. (Path is project-local here, not the upstream default.) |

Both skills live in the `ai_team_config` submodule (added later) and are exposed via `.claude/commands/*.md` symlinks.

## Quick reference

```bash
# Commands below are placeholders — the workspace is not yet scaffolded.
# When packages exist:
pnpm install            # install workspace deps
pnpm --filter consumer-app dev   # run the consumer app
cargo check --workspace          # type-check Rust core
wasm-pack build packages/rust-core   # build the WASM artifact
```

## File paths

- **Architecture decisions:** `docs/architecture/decisions/`
- **Architecture gaps:** `docs/architecture/gaps/index.md`
- **Architecture suggestions:** `docs/architecture/suggestions/`
- **Product specs:** `docs/product/`
- **Memory vault:** `memory/`
- **Agent skills (after submodule add):** `ai_team_config/skills/`
