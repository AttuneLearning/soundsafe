# soundsafe - Codex Agent Instructions

## MANDATORY: Session Start

Before any work, select your sub-role:

1. Read `team.json` → `allowed_sub_roles`
2. Prompt: "Which sub-role for this session?"
3. Read `ai_team_config/roles/{sub-role}.yaml` → holds `function`, `issue_prefix`, `owns`, `does_not_own`, `procedures`, `comms`
4. Hold in memory (do NOT write to file). Confirm: "Operating as **{role_name}**."

## Polling

When asked to "poll" / "start polling":
1. Read your role YAML's `procedures.lifecycle` document
2. Execute the full lifecycle loop described there — not a single scan

Quick-start prompts for each role live in `ai_team_config/prompts/codex/`.

## Project Overview

This is a sound exposure, sensitivity, and reprocessing application.  The intent is to give
a user the option of finding relaxation, trying different sounds, and then self-designing a therapeutic process
the intensive therapy will be reserved for use with a professional.

## Canonical Specs

<!-- TODO: Fill in SPEC_DOCUMENTS for your project -->

---

## Design Principle (BLOCKING)

All new types, API hooks, and backend messages follow **ideal design — no compatibility**.
New fields are `T | null` (always present, nullable), never `T?` (optional/omittable).
Backend messages are prescriptive ("endpoint MUST return X"), not requests.
When a shape changes, update all callers — don't add shims.
See `dev_communication/shared/guidance/DEVELOPMENT_PRINCIPLES.md`.

## Completion Gate (BLOCKING)

No issue marked complete by Dev until ALL pass:
- [ ] Typecheck passes (0 errors)
- [ ] All tests pass
- [ ] New functionality has corresponding tests
- [ ] Session file created
- [ ] Resolution notes appended to issue file

QA independently verifies before issue moves to completed.

## Architecture

ADRs: `dev_communication/shared/architecture/decisions/`
Run `/adr` to check status, `/adr gaps` for unresolved questions.

## Quick Reference

```bash
npm run dev          # Start dev server
npm test             # Run all tests
npx tsc --noEmit     # Type check
```

## File Paths

- **Procedures:** `ai_team_config/procedures/` — universal dev/QA lifecycle docs
- **Dev communication:** `dev_communication/` — issues, messaging, architecture, coordination
- **Memory vault:** `memory/` — patterns, entities, context, sessions
- **Team inbox:** `dev_communication/fullstack/inbox/`
- **Team config:** `team.json`
- **Role definitions:** `ai_team_config/roles/`
