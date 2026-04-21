# Soundsafe — Claude Code Instructions

Soundsafe is a sound-desensitization PWA. Users pick an environmental trigger (dog bark, siren, crying baby, chewing, etc.), apply a chain of audio transforms that reduce its triggering intensity, and step through a graduated "roadmap" from a heavily modified version toward the raw sound.

## Scope of this repo (v1)

**Consumer MVP only.** Public tiers 1–3: Free, Relaxation, Interactive. **No PHI, no therapist features in v1.** Therapist-facing work (assignment, messaging, progress review, client linkage) is deferred to a future HIPAA + GDPR-compliant plugin or second app; the architecture reserves seams for it but ships nothing clinical in v1.

## Canonical docs

| Document | Path |
|---|---|
| Sound-delivery architecture | `dev_communication/shared/specs/sound-delivery.md` |
| Master feature matrix (tiers) | `dev_communication/shared/specs/feature-matrix.md` |
| Product differentiation | `dev_communication/shared/specs/differentiation.md` |
| Content protection (publisher guidance) | `dev_communication/shared/specs/content-protection.md` |
| App architecture plan | `/home/adam/.claude/plans/distributed-napping-lemon.md` |
| Architecture index | `dev_communication/shared/architecture/index.md` |
| ADR decision log | `dev_communication/shared/architecture/decision-log.md` |
| Bootstrap plan | `/home/adam/.claude/plans/cached-wishing-iverson.md` |

## Locked architectural decisions (summary)

See `dev_communication/shared/architecture/decisions/` for full ADRs. Quick index:

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
- **ADR-014** `/memory` + `/adr` skills via `ai_team_config` submodule (**Superseded by ADR-019**).
- **ADR-015** Safety posture: disclaimer + panic-stop + volume ceiling + caps; tunable only above free.
- **ADR-016** Research-driven transforms + signature "extreme pitch-shift LFO" + binaural-beats generator.
- **ADR-017** Music ships as curated packs in v1; no procedural/AI generation.
- **ADR-018** TDD by default; `cargo nextest` + `bacon` + `proptest` (Rust), Vitest + Playwright (TS); `wasm-bindgen-test` reserved for boundary.
- **ADR-019** `/adr` skill made path-configurable upstream; Soundsafe uses default `dev_communication/shared/architecture/` layout.
- **ADR-020** Two WASM instances: AudioWorklet (real-time DSP + safety + roadmap engine) + Decrypt Worker (bulk AES-GCM). Fast-ring SAB + slow postMessage events.
- **ADR-021** `@soundsafe/platform` package with build-time shell selection (`SOUNDSAFE_PLATFORM=web|tauri|mobile`). Web bundles never contain Tauri/mobile imports.
- **ADR-022** Roadmap engine lives in Rust (`sfx-roadmap-engine`), not TS. Audio-accurate Timer / SUDS advance; TS holds an advisory mirror.
- **ADR-023** State management: Zustand for domain stores; `useSyncExternalStore` on SAB-backed readers for audio-thread values.
- **ADR-024** Tier-3 authoring is desktop/tablet only (≥768 px) for v1; phone users are routed to Tier-2 passive playback.
- **ADR-025** Content protection: defend casual disk extraction (OPFS UUID obfuscation, no-URL-addressing, no idle eviction); accept in-session extraction + analog hole. Publisher guidance at `specs/content-protection.md`.

## Design principles (BLOCKING)

1. **No PHI in consumer code paths.** If a feature handles anything that links a named individual to clinical state, it belongs in the future therapist plugin, not here.
2. **Local-first.** Free tier needs no account, no network beyond initial pack download and entitlement check.
3. **Safety rails are always on.** First-run disclaimer, panic-stop, volume ceiling, and ramp-up are non-negotiable at every tier. Only their *values* become tunable in the Interactive tier.
4. **Ideal design, no compatibility shims.** New fields are `T | null` (always present, nullable), never `T?`. When a shape changes, update all callers — don't add shims.

## Skills

All six skills from the `ai_team_config` submodule are installed on this repo via the canonical platform setup scripts:

| Skill | Purpose |
|---|---|
| `/memory` | Manage the extended memory vault at `memory/`. |
| `/adr` | Manage ADRs at `dev_communication/shared/architecture/` (upstream default — no project-local override). |
| `/comms` | Inter-team communication via `dev_communication/{team}/`. |
| `/context` | Pre-implementation context loading from `memory/` + `dev_communication/shared/`. |
| `/reflect` | Post-implementation reflection; writes to `memory/` and `dev_communication/shared/architecture/suggestions/`. |
| `/refine` | Pattern refinement and promotion. |

Skill symlinks live at `.claude/commands/*.md` (Claude Code) and `.codex-workflow/skills/*/SKILL.md` (Codex). Both sets are created by `ai_team_config/platforms/{claude,codex}/setup.sh` and point at the same canonical `ai_team_config/skills/<name>/SKILL.md` files. To reinstall or refresh, run the setup scripts from the repo root with an **absolute** path (relative `PROJECT_ROOT` produces dangling symlinks — upstream bug, worked around, tracked as follow-up).

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

- **Architecture decisions:** `dev_communication/shared/architecture/decisions/`
- **Architecture gaps:** `dev_communication/shared/architecture/gaps/index.md`
- **Architecture suggestions:** `dev_communication/shared/architecture/suggestions/`
- **Narrative specs (architecture + product):** `dev_communication/shared/specs/`
- **Memory vault:** `memory/`
- **Agent skills:** `ai_team_config/skills/`
- **Project-local skill configs:** `.<tool>-config.yml` at repo root (none currently needed — Soundsafe uses all defaults).
