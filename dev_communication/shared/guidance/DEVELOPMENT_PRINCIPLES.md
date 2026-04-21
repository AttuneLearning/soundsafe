# Soundsafe — Development Principles

These four principles are **BLOCKING**. Any code change that violates them is rejected at review.

## 1. No PHI in consumer code paths

If a feature handles anything that links a named individual to clinical state, it belongs in the future therapist plugin, not in the consumer app.

- Anonymous users on the Free tier must remain truly anonymous (no analytics that fingerprint).
- SUDS ratings, exposure history, panic-stop counts: stored locally only (IndexedDB), never transmitted.
- Account holders (Relaxation / Interactive tiers): only entitlement metadata leaves the device — never roadmap content, never SUDS history.

References: ADR-003 (no PHI), ADR-004 (therapist deferred), ADR-011 (local-only progress).

## 2. Local-first

The free tier needs no account, no network beyond the initial pack download and entitlement check.

- All app logic runs in the browser.
- Pack content is delivered via CDN once, then cached.
- No always-on backend service (ADR-006).
- Offline grace window of 72 h after the last successful key fetch (ADR-011).

## 3. Safety rails are always on

Per ADR-015, four rails are non-negotiable at every tier:

- First-run disclaimer (acknowledged before any pack plays).
- Panic-stop button (always visible, also bound to `Esc`, fires even with focus in a text input, fades audio over 500 ms, runs to completion even if the JS thread stalls).
- Volume ceiling (default −12 dBFS peak; tunable at Tier 3 within safe bounds).
- Ramp-up window (default 3.0 s silence → target; tunable at Tier 3).
- Daily exposure cap per trigger (default 15 minutes; tunable at Tier 3).
- Session cool-down (default 10 minutes; tunable at Tier 3 in 10-minute increments — clinically validated by Adam, LPC, on 2026-04-20).

Only the *values* become tunable. The rails themselves cannot be disabled. This is encoded at the type level in `crates/sfx-safety` (no `Option`-wrapped layers, no `disabled` flag, no setter that nulls a rail). Defaults live in `dev_communication/shared/specs/feature-matrix.md`.

References: ADR-015, ADR-024, ADR-025.

## 4. Ideal design, no compatibility shims

When a shape changes, update all callers. Don't add shims.

- New fields are `T | null` (always present, nullable), **never** `T?` (optional/omittable).
- Backend / serverless messages are prescriptive ("endpoint MUST return X"), not negotiable.
- Pack-manifest schema and roadmap-JSON schema are stable APIs (ADR-016): additive changes only, no parameter renames without a deprecation path. A Tier-3 roadmap authored in v1 must play identically in any future version.

Removed code is removed. No `// removed` comment trails. No re-exports of dead types. No backwards-compat shims for unimplemented features.

## Enforcement

- Per-PR: the specialized review subagents at `.claude/agents/` enforce these principles narrowly (DSP, safety, crypto, platform, accessibility). Run them on PRs that touch their domain.
- Per-week: `.claude/agents/adr-drift-detector` checks the codebase against the ADR set as a whole.
- Per-release: full Playwright + axe-core + manual safety walkthrough (M2+).
