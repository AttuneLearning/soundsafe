# ADR-002: UI framework — React + TypeScript + wasm-bindgen

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Frontend

## Context

The UI must integrate with a Rust/WASM audio core and present non-trivial interactive surfaces: roadmap builder, transform chain editor, playback controls, safety controls, subscription flows. We need a framework with a mature ecosystem for forms, accessibility, and complex component composition.

Alternatives considered: React + TypeScript, Svelte/SvelteKit, a full-Rust frontend (Leptos or Dioxus), Vue 3.

## Decision

We use **React + TypeScript** for the UI layer and **`wasm-bindgen`** to bridge to the Rust core. The Rust core is compiled with `wasm-pack` and imported as an ES module.

## Consequences

### Positive
- Largest component ecosystem (Radix, shadcn/ui, React Aria) and hiring pool.
- First-class TypeScript story; strong types can mirror types exported from Rust via `tsify` or hand-maintained declarations.
- Familiar test tooling (Vitest, Playwright, Testing Library).

### Negative / trade-offs
- Two languages across the WASM boundary — hand-maintained or generated type contracts will need care.
- React's default rendering model isn't ideal for real-time audio UI (meters, waveforms); we'll need to use refs + `useSyncExternalStore` for real-time views.

### Neutral / to watch
- Keep all `wasm-bindgen` surfaces in a single `rust-core` package and a thin TS wrapper. Avoid ad-hoc imports of WASM from components.

## Alternatives considered

- **Full-Rust (Leptos/Dioxus).** One language across the boundary, but smaller component ecosystem and a steeper hiring bar for an MVP.
- **Svelte.** Smaller bundles, clean reactivity. Ecosystem thinner for forms-heavy clinical UI.
- **Vue 3.** Fine choice; less internal momentum and fewer accessible component libraries than React.

## References

- Related ADRs: ADR-001 (platform), ADR-005 (workspace layout).
