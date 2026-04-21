# Soundsafe — Codex Agent Instructions

## MANDATORY: Session Start

Before any work, select your sub-role:

1. Read `team.json` → `allowed_sub_roles` (currently `fullstack-dev`, `fullstack-qa`).
2. Prompt: "Which sub-role for this session?"
3. Read `ai_team_config/roles/{sub-role}.yaml` — holds `function`, `issue_prefix`, `owns`, `does_not_own`, `procedures`, `comms`.
4. Read the project-local role guidance: `dev_communication/shared/guidance/FULLSTACK_{DEV|QA}_ROLE_GUIDANCE.md`.
5. Hold in memory (do NOT write to file). Confirm: "Operating as **{role_name}**."

## Polling

When asked to "poll" / "start polling":
1. Read your role YAML's `procedures.lifecycle` document.
2. Execute the full lifecycle loop described there — not a single scan.

Quick-start prompts for each role live in `ai_team_config/prompts/codex/` (including `fullstack-qa-autonomous-sweep.md` and `fullstack-qa-manual-review-pass.md`).

## Project Overview

Soundsafe is a sound-desensitization PWA. Users pick an environmental trigger (dog bark, siren, crying baby, chewing, alarm, etc.), apply a chain of audio transforms that reduce its triggering intensity, and step through a graduated "roadmap" from a heavily modified version toward the raw sound. Rust/WASM audio core, React/TypeScript UI, encrypted sound packs from a CDN, fully local playback and state.

**Scope of v1:** consumer MVP only — public Tiers 1–3 (Free, Relaxation, Interactive). No PHI, no therapist features in v1 (ADR-003, ADR-004); the architecture reserves seams for a future HIPAA + GDPR-compliant therapist plugin.

## Canonical Specs

| Document | Path |
|---|---|
| Sound-delivery architecture | `dev_communication/shared/specs/sound-delivery.md` |
| Master feature matrix (tiers) | `dev_communication/shared/specs/feature-matrix.md` |
| Product differentiation | `dev_communication/shared/specs/differentiation.md` |
| Content protection (publisher guidance) | `dev_communication/shared/specs/content-protection.md` |
| Tier-3 workspace mockup | `dev_communication/shared/specs/mockups/tier-3-interactive.html` |
| Architecture index | `dev_communication/shared/architecture/index.md` |
| ADR decision log | `dev_communication/shared/architecture/decision-log.md` |
| M1 phase plan | `dev_communication/shared/specs/m1-phases.md` |
| App architecture plan | `/home/adam/.claude/plans/distributed-napping-lemon.md` |

## Design Principles (BLOCKING)

See `dev_communication/shared/guidance/DEVELOPMENT_PRINCIPLES.md` for the full discussion. Summary:

1. **No PHI in consumer code paths.** Anything that links a named individual to clinical state belongs in the future therapist plugin, not here.
2. **Local-first.** Free tier needs no account, no network beyond initial pack download and entitlement check.
3. **Safety rails are always on.** Disclaimer, panic-stop, volume ceiling, ramp-up, exposure cap, cool-down — non-negotiable at every tier (ADR-015). Only their *values* become tunable in the Interactive tier.
4. **Ideal design, no compatibility shims.** New fields are `T | null` (always present, nullable), never `T?`. When a shape changes, update all callers — don't add shims.

## Completion Gate (BLOCKING)

No issue marked complete by Dev until ALL pass:
- [ ] `cargo check --workspace` (0 errors)
- [ ] `pnpm -r typecheck` (0 errors)
- [ ] `cargo nextest run --workspace` (all green)
- [ ] `pnpm test` (all green)
- [ ] New functionality has corresponding tests
- [ ] Session file created at `memory/sessions/{date}-{issue-slug}.md`
- [ ] Resolution notes appended to issue file (`## Dev Response (ISO timestamp)` section with commit hash + push statement)
- [ ] Commit hash and push evidence present in the handoff message

Fullstack-QA independently verifies before moving the issue to `dev_communication/fullstack/issues/completed/`.

## Architecture

ADRs: `dev_communication/shared/architecture/decisions/` (ADR-001 through ADR-025 at time of writing). Run `/adr` for status, `/adr gaps` for unresolved questions. ADR-016 is the "stable `rust-core` API" rule — additive changes only, no parameter renames without a deprecation path.

## Quick Reference

```bash
# TypeScript / pnpm workspace
pnpm install                     # install workspace deps
pnpm --filter @soundsafe/consumer-app dev   # run the consumer app
pnpm -r typecheck                # typecheck all packages
pnpm test                        # vitest across packages

# Rust / Cargo workspace
cargo check --workspace          # type-check Rust core
cargo nextest run --workspace    # full test suite
cargo clippy --workspace --all-targets

# WASM
wasm-pack build packages/rust-core --target web --out-dir pkg
wasm-pack test --node packages/rust-core
```

## Autonomous Keepalive Loop

A cron-driven script keeps work moving forward between interactive sessions. Every 15 minutes (configurable), it:

1. Checks `dev_communication/fullstack/inbox/` for unprocessed messages and `dev_communication/fullstack/issues/queue/` for pending issues.
2. Writes a timestamped status file to `dev_communication/fullstack/status/<ISO-timestamp>_status.md` with the scan results.
3. If pending work exists **and** the self-throttle window (default 3 hours) has elapsed since the last Claude invocation, resumes the last Claude conversation non-interactively via `claude --print --continue`. The prompt tells the resumed Claude to process the work per the team's lifecycle, commit + push, and append findings to the status file.
4. Garbage-collects status files older than 7 days.

**Wire it up** (once):

```bash
crontab -e
# Add:
*/15 * * * * /home/adam/github/soundsafe/scripts/keepalive-cron.sh >> /home/adam/.claude/keepalive-fullstack.log 2>&1
```

**Pause** without editing cron: `touch ~/.claude/pause-keepalive-fullstack`. Resume with `rm`.

**Dry-run once:** `./scripts/keepalive-cron.sh --dry-run` — prints what it would do, writes a status file, doesn't invoke Claude.

**Caveat.** `claude --print --continue` resumes *the most recent conversation* in this directory. If an interactive Claude session is open here, the cron nudge resumes it. For strict separation, run the cron loop against a dedicated checkout.

## File Paths

- **Procedures:** `ai_team_config/procedures/` — universal dev/QA lifecycle docs
- **Dev communication:** `dev_communication/` — issues, messaging, architecture, coordination
- **Memory vault:** `memory/` — patterns, entities, context, sessions
- **Team inbox:** `dev_communication/fullstack/inbox/`
- **Team status log (keepalive runs):** `dev_communication/fullstack/status/`
- **Team config:** `team.json`
- **Role definitions (canonical):** `ai_team_config/roles/`
- **Role guidance (project-local):** `dev_communication/shared/guidance/FULLSTACK_*_ROLE_GUIDANCE.md`
- **Specialized review subagents (Claude Code):** `.claude/agents/` (dsp-reviewer, safety-reviewer, crypto-reviewer, platform-boundary-reviewer, accessibility-reviewer, adr-drift-detector)
- **Autonomous cron wrapper:** `scripts/keepalive-cron.sh` (calls `ai_team_config/scripts/team-keepalive.sh` with Soundsafe args)
