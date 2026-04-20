# Architecture Index

Central hub for Soundsafe architecture documentation.

## Quick navigation

- [Decision log](decision-log.md) — chronological list of ADRs
- [Decisions/](decisions/) — full ADR files
- [Gaps](gaps/index.md) — known unresolved architectural questions
- [Suggestions](suggestions/) — pending suggestions awaiting ADR promotion
- [Templates](templates/adr-template.md) — ADR template

## Flagship documents

Narrative design specs live alongside this tree at `../specs/`:

| Doc | Covers |
|---|---|
| [sound-delivery.md](../specs/sound-delivery.md) | End-to-end: pack format, CDN flow, WASM audio pipeline, caching, update channel, offline behavior, threat model, therapist-plugin seams. |
| [feature-matrix.md](../specs/feature-matrix.md) | Tier-by-tier feature list the architecture must support. |
| [differentiation.md](../specs/differentiation.md) | Competitive positioning and product differentiation. |

## How this is organized

- **ADRs (`decisions/`)** capture decisions that are hard to reverse or that shape multiple subsystems. Numbered `ADR-NNN-slug.md`. Status field: Proposed / Accepted / Superseded / Deprecated.
- **Gaps (`gaps/index.md`)** catalog questions that deserve ADRs but aren't yet decided. Prevents unresolved choices from being forgotten.
- **Suggestions (`suggestions/`)** are proposed architecture changes written up for review. Accepted ones are promoted to ADRs and the suggestion file is archived.

## Skill integration

The `/adr` skill (from the `ai_team_config` submodule) reads and writes this tree. Soundsafe uses the skill's default layout at `dev_communication/shared/architecture/`; no project-local `.adr-config.yml` is needed. See ADR-019 for the current decision (supersedes ADR-014).

## Related

- [Memory vault](../../../memory/index.md) — broader knowledge including entities, patterns, context, session notes.
