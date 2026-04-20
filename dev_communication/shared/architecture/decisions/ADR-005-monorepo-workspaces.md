# ADR-005: Monorepo with pnpm + Cargo workspaces

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Repo

## Context

The product will have at least these code surfaces: a Rust/WASM audio core, a UI kit, the consumer app, a pack-building CLI, serverless worker code, and (later) a therapist plugin and native shells. These must share types and versioning.

## Decision

We use a **single monorepo** from day 1, combining **pnpm workspaces** (JS/TS) and a **Cargo workspace** (Rust).

Planned workspace layout (as of v1 bootstrap):

```
packages/
  rust-core/        # Rust → WASM audio engine
  ui-kit/           # shared React components
  consumer-app/     # the v1 shipping product
  pack-tooling/     # offline builder: encrypt + sign packs
infra/
  workers/          # serverless entitlement + key endpoint
  schemas/          # pack manifest JSON schema
```

Reserved for later (not created in v1): `packages/therapist-plugin/`, `packages/desktop-shell/`, `packages/mobile-shell/`.

## Consequences

### Positive
- Atomic changes across the WASM boundary in a single commit.
- Shared TS types between the UI, workers, and pack tooling without publishing packages.
- Clear seams from day 1 — no "split this later" migration cost.

### Negative / trade-offs
- Monorepo tooling has a learning curve (pnpm filters, Cargo workspace features).
- CI must be tuned to avoid rebuilding unchanged packages.

### Neutral / to watch
- Consider Nx or Turborepo for task graphs if build times become a problem. Not needed at bootstrap.
- Lockfiles: one `pnpm-lock.yaml` at root, one `Cargo.lock` at root.

## Alternatives considered

- **Single repo, no workspaces.** Cheapest initially; expensive migration when the plugin and shells arrive.
- **Multi-repo, Rust core as a published package.** Strongest boundary but heavy overhead for a small team.

## References

- Related ADRs: ADR-001, ADR-002, ADR-004 (reserved plugin slot).
