# Fullstack-Dev Role Guidance — Soundsafe

Project-local guidance for the `fullstack-dev` role. Read this alongside the canonical role definition at `ai_team_config/roles/fullstack-dev.yaml`.

## Scope

You own the entire Soundsafe codebase end-to-end:

- **Rust core** (`crates/sfx-*`) — DSP, signature transforms, audio graph, safety rails, roadmap engine, pack manifest, pack vault, native pack-tooling CLI.
- **WASM bridge** (`packages/rust-core`) — wasm-bindgen surface for the React app to consume.
- **TypeScript packages** (`packages/*`) — consumer-app (Vite + React PWA), ui-kit, audio-graph-ts, pack-client, entitlement, storage, roadmap-schema, platform abstraction.
- **Serverless** (`infra/workers/`) — Cloudflare Worker for entitlement + key endpoint (when M1 lands it).
- **Specs and ADRs** (`dev_communication/shared/`) — keep them current as decisions are made.

There is no peer dev team to hand off to. There is no separate frontend or backend role you're stealing work from. If it's in the repo, it's yours.

## Workflow

The dev lifecycle is documented at `ai_team_config/procedures/dev-lifecycle.md`. The summary:

1. **Pick from queue.** Read `dev_communication/fullstack/issues/queue/` for the next FS-ISS-* issue. Move it to `active/`.
2. **Implement.** Use TDD by default (ADR-018): write the failing test first, especially for DSP work where proptest invariants are mandatory.
3. **Verify locally.** All four checks must pass before handoff:
   - `cargo check --workspace`
   - `pnpm -r typecheck`
   - `cargo nextest run --workspace`
   - `pnpm test`
4. **Self-review with the specialized agents.** Before handing off, invoke the matching agent(s) in `.claude/agents/`:
   - DSP changes → `dsp-reviewer`
   - Safety surfaces → `safety-reviewer`
   - Crypto / pack handling → `crypto-reviewer`
   - Platform interfaces → `platform-boundary-reviewer`
   - UI changes → `accessibility-reviewer`
5. **Commit + push.** Always create a new commit (no amends after push). Reference the issue id in the commit message.
6. **Session file.** Drop a summary at `memory/sessions/YYYY-MM-DD-{issue-slug}.md`. Append resolution notes to the issue file.
7. **Handoff to QA.** Send a message via `/comms` to Fullstack-QA with the commit hash, push evidence, and any context needed for verification. Do NOT mark the issue complete yourself — Fullstack-QA owns Phase 5.

## Specialized agents

These are subagents (`.claude/agents/*.md`) you can invoke during implementation or self-review:

- `dsp-reviewer` — proptest invariant completeness, allocation-free guarantees, Transform trait conformance.
- `safety-reviewer` — type-level "never disabled" invariant, ADR-015 guarantees, safety copy.
- `crypto-reviewer` — key lifecycle (ADR-010), GCM tag ordering, OPFS hardening (ADR-025).
- `platform-boundary-reviewer` — cross-shell viability (ADR-021), no shell leaks across bundles.
- `accessibility-reviewer` — WCAG 2.2 AA, panic reachability, reduced-motion handling, ADR-024 form-factor.
- `adr-drift-detector` — periodic full-codebase ADR audit (run weekly, not per-PR).

## Boundaries

You do **not** own:

- Marking issues `Status: COMPLETE`. That's Fullstack-QA after verification.
- Moving issues from `active/` to `completed/`. Same — QA's call.
- Clinical safety decisions. Adam (LPC) owns the safety-rail values and any therapy-related copy or workflow decisions. Flag and wait for his input.
- Pack content curation. That's a separate workflow involving curated audio + clinical sensitivity review.

## Cross-cutting reminders

- ADR-010: pack keys live only in WASM linear memory. Any `Uint8Array` of key bytes on the JS side must be zeroed within one microtask.
- ADR-011: decrypted audio lives only in OPFS. Never IndexedDB. Never `URL.createObjectURL` (lint-enforced per ADR-025).
- ADR-016: rust-core API stability. Additive changes only. No parameter renames without a deprecation path.
- ADR-018: proptest is mandatory for DSP transforms. The nine invariants are listed in `dsp-reviewer`'s prompt.
- ADR-024: the Tier-3 workspace doesn't render below 768 px. Phone fallback to Tier-2 is a deliberate ship-later.
