# Soundsafe — Project Memory

Memory vault for the agent team. Persistent knowledge that survives across sessions.

## Polling

When told to poll: read your role YAML's `procedures.lifecycle` field and follow that document. **Not** passive file watching. **Not** just reporting what files exist. Execute the full lifecycle loop.

Quick-start prompts: `ai_team_config/prompts/claude/{role}-polling.md` (or `prompts/codex/` for Codex).

## Vault Structure

- `index.md` — top-level navigation.
- `memory-log.md` — chronological list of additions and changes.
- `notes.md` — low-ceremony quick captures.
- `entities/` — core concepts and components ("nouns" of the project).
- `patterns/` — recurring solutions and conventions.
- `sessions/` — session summaries (`YYYY-MM-DD-{slug}.md`).
- `context/` — background and foundational knowledge.
- `templates/` — entry templates.
- `prompts/` — agent prompt registry (created by the team installer).
- `team-configs/` — team-specific configuration (created by the team installer).

## Project-Specific Notes

- **User role:** Adam is a Licensed Professional Counselor (LPC). He owns the clinical posture for safety rails and exposure-therapy protocols. Flag clinical decisions and wait for his input rather than assuming defaults.
- **Pre-code → M0 scaffolding done.** As of 2026-04-20: Cargo + pnpm workspaces in place, all crates and packages stubbed, `consumer-app` boots a disclaimer + inert panic. Substantive M1 work (one playable transform end-to-end) is the next milestone.
- **Architecture plan:** `/home/adam/.claude/plans/distributed-napping-lemon.md` (out-of-tree, agent-local). Reflects the Rust/WASM thick-core + React UI + future Tauri/mobile direction codified in ADRs 020–025.
- **TDD is the default workflow.** Proptest is mandatory for DSP transforms (see ADR-018). Six specialized review subagents at `.claude/agents/` enforce the per-domain disciplines (DSP, safety, crypto, platform, accessibility, ADR drift).
