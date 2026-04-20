# ADR-014: Memory + ADR skills via ai_team_config submodule

**Status:** Superseded
**Date:** 2026-04-19
**Domain:** Tooling
**Superseded by:** [ADR-019](ADR-019-adr-skill-path-configurable.md)

> **Note (2026-04-20):** ADR-019 replaces this decision. The planned project-local `docs/architecture/` override was never implemented. Instead, the `/adr` skill was patched upstream to accept a project-local `.adr-config.yml`, and Soundsafe adopted the default `dev_communication/shared/architecture/` layout. Read ADR-019 for the current state; this ADR is retained for history only.

## Context

The user has an existing `ai_team_config` repo (`git@github.com:AttuneLearning/ai_team_config.git`) providing Claude Code skills, including `/memory` (extended memory vault) and `/adr` (architecture decision management). These skills are already in use on an adjacent project and the user wants the same tooling on Soundsafe.

The existing `/adr` skill hard-codes its path to `dev_communication/shared/architecture/`, which is a cross-team-shared path specific to the multi-repo setup the skill was originally authored for. Soundsafe is a single monorepo with no `dev_communication/` tree; ADRs should live at `docs/architecture/`.

## Decision

- Add `AttuneLearning/ai_team_config` as a **git submodule** at `ai_team_config/` in the Soundsafe repo.
- Expose `/memory` and `/adr` via `.claude/commands/memory.md` and `.claude/commands/adr.md` as symlinks into the submodule's `skills/*/SKILL.md` files.
- **Update the `/adr` skill upstream** so the ADR root path is configurable (e.g., via a top-level `.adr-config.yml` or equivalent), defaulting to `docs/architecture/` if no cross-team `dev_communication/` tree is present. Soundsafe sets the path to `docs/architecture/`.
- If upstreaming is blocked or slow, fork the submodule or vendor-and-patch.

## Consequences

### Positive
- Same tooling across the user's projects; knowledge and habits transfer.
- Upstream improvements to the skills benefit all users of the submodule.
- The `/memory` skill works out of the box — it already targets a project-local `memory/` path.

### Negative / trade-offs
- Submodule workflow has edge cases (detached heads, forgotten updates).
- The upstream-update path requires a PR or fork.

### Neutral / to watch
- Keep the Soundsafe-specific path override in a project-local config file, not in the submodule, so the submodule stays generically useful.

## Alternatives considered

- **Vendor the skills directly (copy, no submodule).** Loses upstream sync; duplicates maintenance.
- **Do not use these skills; write new ones.** Reinvents what already works.

## References

- `ai_team_config` repo: `git@github.com:AttuneLearning/ai_team_config.git`
- Skill files (reference): `skills/memory/SKILL.md`, `skills/adr/SKILL.md`.
