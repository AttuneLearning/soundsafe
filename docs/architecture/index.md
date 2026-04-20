# Architecture Index

Central hub for Soundsafe architecture documentation.

## Quick navigation

- [Decision log](decision-log.md) — chronological list of ADRs
- [Decisions/](decisions/) — full ADR files
- [Gaps](gaps/index.md) — known unresolved architectural questions
- [Suggestions](suggestions/) — pending suggestions awaiting ADR promotion
- [Templates](templates/adr-template.md) — ADR template

## Flagship documents

| Doc | Covers |
|---|---|
| [sound-delivery.md](sound-delivery.md) | End-to-end: pack format, CDN flow, WASM audio pipeline, caching, update channel, offline behavior, threat model, therapist-plugin seams. |

## How this is organized

- **ADRs (`decisions/`)** capture decisions that are hard to reverse or that shape multiple subsystems. Numbered `ADR-NNN-slug.md`. Status field: Proposed / Accepted / Superseded / Deprecated.
- **Gaps (`gaps/index.md`)** catalog questions that deserve ADRs but aren't yet decided. Prevents unresolved choices from being forgotten.
- **Suggestions (`suggestions/`)** are proposed architecture changes written up for review. Accepted ones are promoted to ADRs and the suggestion file is archived.

## Skill integration

The `/adr` skill (from the `ai_team_config` submodule) reads and writes this tree. The skill's default path is `dev_communication/shared/architecture/` — Soundsafe uses `docs/architecture/` via a project-local override. See ADR-014.

## Related

- [Memory vault](../../memory/index.md) — broader knowledge including entities, patterns, context, session notes.
- [Feature matrix](../product/feature-matrix.md) — tier-by-tier feature list the architecture has to support.
