# ADR-023: State management — Zustand for domain state, `useSyncExternalStore` for audio-thread values

**Status:** Accepted
**Date:** 2026-04-20
**Domain:** Frontend

## Context

The Tier-3 workspace has two kinds of state:

1. **Domain state** — the current session, the loaded roadmap, the safety settings, the library of packs. Mutates on user action; read by many components; needs selectors to avoid re-rendering the world when one field changes.

2. **Audio-thread-derived state** — the playhead position, the current level meter, which step the engine is on *right now*. Mutates at audio rate (every 128-sample block). Read from a `SharedArrayBuffer` fast ring (ADR-020). Cannot flow through React's default rendering without rendering the app every frame.

React's built-in `useState` + Context is fine for neither at scale: Context re-renders all consumers on any change, and passing audio-rate values through Context is a DevTools-destroying perf disaster.

The classic state-management options (Redux, MobX, Zustand, Jotai, Valtio) serve the domain-state case with varying boilerplate. None of them is designed for audio-rate subscriptions — that's a `useSyncExternalStore` job.

## Decision

**Split the concern along the thread boundary.**

### Domain state → Zustand

Three domain stores:

- `sessionStore` — current pack, current roadmap, current step (mirror), panic state.
- `roadmapStore` — editable roadmap draft, transform chain, per-step params, save/load.
- `safetyStore` — user-tunable safety values (ceiling, ramp, cap, cool-down), acknowledged values from WASM.

Zustand chosen over alternatives because:
- Minimal boilerplate — one store definition per domain, typed selectors, no provider tree.
- Selector-based subscriptions — components re-render only when their slice changes.
- TypeScript ergonomics are first-class; no `connect`-style HOCs.
- DevTools integration via middleware when wanted.
- Persistence middleware (for `safetyStore` → IndexedDB via the platform `KvStore`) is a one-liner.

### Audio-thread state → `useSyncExternalStore` + SAB readers

The `AudioService` (from `@soundsafe/platform`) exposes:

- `readPlayhead(): number` — reads the current sample position from the fast ring.
- `readLevelDb(): number` — reads the post-limiter peak level.
- `subscribe(event, cb)` — subscribes to event types on the fast ring.

Components that render audio-rate values (`<Playhead>`, level meters) use `useSyncExternalStore` bound to these readers. React only re-renders the subscribed leaf, and the reader never crosses the React reconciler for the value itself.

## Consequences

### Positive
- Domain state is simple, testable, and DevTools-friendly.
- Audio-rate rendering is cheap and doesn't pollute store state.
- Components subscribe to exactly what they care about — no spurious re-renders.
- Persistence story for `safetyStore` is clean (KvStore middleware); session + roadmap stores are ephemeral or persisted via separate routines that can batch writes.

### Negative / trade-offs
- Two patterns to learn (Zustand for domain, `useSyncExternalStore` for audio). Documented; not a large burden.
- The `sessionStore.currentStep` field is a **mirror** of the worklet's authoritative value. Its write path is "fast-ring event listener → store update," not "user action." Contributors must not mutate it directly; guarded by type and in code review.
- Zustand's global-store pattern makes "testing a store in isolation" work, but integrating three stores in a Vitest test requires explicit resets in `beforeEach`.

### Neutral / to watch
- If Zustand's ecosystem drifts (maintainers change direction, v5 introduces breaking changes), switching to Jotai is possible — the slice-boundary organization is compatible. The decision is pragmatic, not religious.
- For deeply nested roadmap editing (e.g., a transform's parameter set changes), Zustand's shallow-compare may cause occasional over-rendering. If it bites, introduce `immer` middleware or narrow the selectors further.

## Alternatives considered

- **Redux Toolkit.** Rejected: boilerplate cost not justified at this scale; Zustand wins ergonomics.
- **Jotai.** Viable — atomic-state model fits the domain. Chose Zustand on slight ergonomic preference and the ability to co-locate actions with state in one file per domain. Jotai is the most-likely swap target if Zustand ever disappoints.
- **React Context + `useReducer`.** Rejected: re-render-all-consumers is wrong for a dense workspace with 40+ live components subscribed to session state.
- **Only `useSyncExternalStore` for everything.** Rejected: requires implementing selectors, persistence, and DevTools from scratch. Zustand brings all of those.
- **Only Zustand for everything (including audio values).** Rejected: audio-rate writes into a React-reactive store re-render the world every block.

## References

- ADR-002 (React + TS)
- ADR-011 (local-only progress → KvStore persistence)
- ADR-020 (SAB fast ring provides the audio-rate reads)
- ADR-022 (roadmap engine in Rust → `currentStep` is a mirror, not a source of truth)
- Plan: `/home/adam/.claude/plans/distributed-napping-lemon.md` §State management + data flow
