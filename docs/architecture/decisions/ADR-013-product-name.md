# ADR-013: Product name — Soundsafe

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Product

## Context

The product needs a canonical name for code identifiers, package names, domain choices, app-manifest metadata, and user-facing copy. The working directory was briefly `soundsafe_test` during initial bootstrap (2026-04-19) and was renamed to `soundsafe` on 2026-04-20.

## Decision

The product name is **Soundsafe**. Conventions:

- Marketing / UI copy: "Soundsafe" (single word, capital S).
- Code / package identifiers: `soundsafe` (lowercase), with dashes for multi-word scoped names (e.g., `@soundsafe/rust-core`, `soundsafe-consumer-app`).
- Working directory: `soundsafe/`.

## Consequences

### Positive
- Directly evokes the core product promise (making triggering sound feel safe).
- Short, memorable, easy to type.
- Domain availability should be checked before launch but is plausible for a new product in this space.

### Negative / trade-offs
- "Soundsafe" is a plausible brand name in unrelated fields (e.g., industrial hearing protection). Trademark and domain clearance required before marketing spend.

### Neutral / to watch
- If trademark clearance fails, rename by global find-and-replace of `soundsafe`, `Soundsafe`, and `SOUNDSAFE` in code and docs — which is why the identifier convention is predictable.

## Alternatives considered

- **Continue with placeholder.** Deferred naming slows branding work without benefit here.

## References

- Product working dir: `/home/adam/github/soundsafe/`.
