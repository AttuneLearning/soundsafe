# Memory Vault

Extended memory repository for Soundsafe development. This vault stores persistent knowledge that AI agents (and humans) can reference across sessions.

## Quick navigation

- [Memory log](memory-log.md) — chronological list of additions
- [Notes](notes.md) — low-ceremony quick captures
- [Entities](entities/index.md) — key concepts, systems, components ("nouns")
- [Patterns](patterns/index.md) — recurring solutions, conventions, best practices
- [Sessions](sessions/) — session summaries
- [Context](context/) — background and foundational knowledge
- [Templates](templates/) — templates for new entries

## Memory types

### Entities
The "nouns" of the project. Core concepts, systems, components. Examples we might capture: the Rust core's `Transform` trait; the pack manifest; the panic-stop pipeline.
→ [[entities/index]]

### Patterns
Recurring solutions and conventions discovered through development. Examples: how audio-thread-safe DSP is structured; how WASM <-> TS types stay synchronized; how roadmap JSON migrations are handled.
→ [[patterns/index]]

### Sessions
Session summaries capturing decisions, discoveries, and work completed. Each file lives at `sessions/YYYY-MM-DD-<slug>.md`.

### Context
Background information and foundational knowledge that doesn't fit neatly into entities or patterns — the "why" and the landscape, not the specific shape. Examples: the exposure-therapy literature we lean on; the security posture rationale; the therapist-plugin roadmap.

## Related

- [Architecture index](../docs/architecture/index.md)
- [Feature matrix](../docs/product/feature-matrix.md)
- [Project instructions](../CLAUDE.md)

## How to use this vault

1. **Start with [[memory-log]]** to see recent additions and changes.
2. **Search entities** when you need to understand a concept or component.
3. **Reference patterns** for established solutions to common problems.
4. **Check sessions** for historical context on past decisions.
5. **Use backlinks** (Obsidian-style `[[...]]`) to discover connections.

## Tags

- `#entity` — core concepts and components
- `#pattern` — reusable patterns
- `#session` — session summaries
- `#context` — background information
- `#decision` — key decisions (ADRs live under `docs/architecture/decisions/`)
- `#safety` — safety-related memory
- `#audio` — audio/DSP-related memory
- `#security` — security-related memory

## Skill integration

Managed by the `/memory` skill from the `ai_team_config` submodule (after that submodule is added; see ADR-014).
