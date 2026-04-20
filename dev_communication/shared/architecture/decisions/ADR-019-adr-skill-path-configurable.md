# ADR-019: `/adr` skill path configurable upstream; Soundsafe on default layout

**Status:** Accepted
**Date:** 2026-04-20
**Domain:** Tooling
**Supersedes:** ADR-014

## Context

ADR-014 planned to override the `/adr` skill's hardcoded path (`dev_communication/shared/architecture/`) so Soundsafe ADRs could live at `docs/architecture/`. Two things happened after that decision:

1. The override was never implemented — the skill still pointed at `dev_communication/shared/architecture/`, meaning `/adr` would have been broken on Soundsafe until one of the ADR-014 fallbacks (upstream change, fork, or vendor-patch) was executed.
2. When we circled back to execute, we took the upstreaming path: we patched `attunelearning/ai_team_config` to read an optional project-local `.adr-config.yml` that overrides the ADR root, defaulting to the existing hardcoded value so no existing user breaks.

With the skill now path-configurable upstream, Soundsafe no longer needs a project-local layout — the "upstream assumes a specific path" friction is gone. Aligning on the default means one less thing to remember across projects, and it makes Soundsafe interchangeable with any other project that uses the submodule.

## Decision

1. **Upstream patch accepted.** `attunelearning/ai_team_config` `main` now resolves `/adr`'s root from `./.adr-config.yml` if present; defaults to `dev_communication/shared/architecture/` if absent. See `ai_team_config/skills/adr/SKILL.md` and `ai_team_config/.adr-config.yml.example`.
2. **Soundsafe adopts the default layout.** ADR infrastructure moved from `docs/architecture/` to `dev_communication/shared/architecture/`. Narrative architecture (`sound-delivery.md`) and product specs (`feature-matrix.md`, `differentiation.md`) moved to `dev_communication/shared/specs/`. The `docs/` tree is removed.
3. **No `.adr-config.yml` in Soundsafe.** Because we use the default.
4. **Canonical installer used.** Instead of the hand-rolled `.claude/commands/` symlinks from the ADR-014 bootstrap, Soundsafe now runs `ai_team_config/platforms/{claude,codex}/setup.sh` from the repo root. This installs all six skills (not just `/adr` and `/memory`) and wires up Codex alongside Claude Code.
5. **Config naming convention.** Future project-local skill configs follow `.<tool>-config.yml` (e.g., `.adr-config.yml`). Documented here so later skills stay consistent.

## Consequences

### Positive
- Same ADR layout across every project that uses the submodule. Knowledge and muscle memory transfer cleanly.
- Codex gets `/adr` automatically via the shared `SKILL.md`; no platform-specific skill maintenance.
- Zero documentation debt: `/adr` on this repo behaves exactly as the upstream default.
- ADR-014's upstreaming alternative is now reality; no fork or vendor-patch to maintain.

### Negative / trade-offs
- The `docs/` convention common in many repos no longer applies here; newcomers may look there first.
- Cross-repo links that referenced `soundsafe/docs/architecture/…` become stale.

### Neutral / to watch
- `/reflect` and `/refine` skills still hardcode `dev_communication/shared/architecture/`. Harmless for Soundsafe (we use the default) but a footgun if a future project sets a non-default `adr_root`. Tracked upstream as follow-up.
- The canonical `platforms/*/setup.sh` scripts have a bug: with a relative `PROJECT_ROOT` (e.g., `.`), they produce dangling symlinks. Workaround: always invoke with an absolute path. Worth patching upstream.
- `.gitmodules` originally used lowercase `attunelearning`; normalized to canonical `AttuneLearning` in the same commit that records this ADR.

## Alternatives considered

- **Keep ADR-014's project-local `docs/architecture/` override.** Rejected: would require maintaining a diverging layout without benefit, given the skill is now configurable.
- **Fork the submodule.** Rejected: duplicate maintenance, loses upstream sync.
- **Vendor-and-patch (copy `SKILL.md` into `.claude/commands/` and modify).** Rejected: loses upstream sync; upstreaming landed quickly anyway.

## References

- Supersedes: ADR-014
- Upstream skill: `ai_team_config/skills/adr/SKILL.md`
- Upstream config template: `ai_team_config/.adr-config.yml.example`
- Merge commit upstream: `ca125b7` on `attunelearning/ai_team_config` `main`.
