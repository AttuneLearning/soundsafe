# ADR-001: Platform target — Web / PWA for MVP

**Status:** Accepted
**Date:** 2026-04-19
**Domain:** Platform

## Context

Soundsafe must ship on something. Options considered were web (PWA), native desktop (Tauri), native mobile (Tauri-mobile / Capacitor), or all. Team size is small. Audio processing will live in Rust/WASM, which runs in all of the above, but each shell has different packaging, permissions, audio-latency, and distribution costs.

## Decision

The v1 MVP ships as a **Web / Progressive Web App only**. The codebase is structured so a Tauri desktop shell and a mobile shell can be added later without rewriting the Rust core or the UI.

## Consequences

### Positive
- Fastest path to launch. No app-store review cycles, no code-signing tooling, no platform-specific install flows.
- Single distribution channel and update channel.
- PWA install on desktop Chromium and Android covers a large fraction of the addressable audience.

### Negative / trade-offs
- iOS Safari PWA has limited background audio and storage quotas; iPhone users get a weaker experience until a native shell arrives.
- Push notifications are limited on iOS. Not relevant in v1 (no account / no assignments), but will matter for the therapist plugin.

### Neutral / to watch
- Keep Web Audio API usage inside a thin adapter so a native audio backend (cpal via Tauri) can replace it later.

## Alternatives considered

- **Tauri desktop from day 1.** Best audio latency and storage story, but adds a platform we must support and slows MVP.
- **Native mobile from day 1.** Highest build cost; app-store review adds risk; no payoff until the product's value prop is proven.

## References

- Related ADRs: ADR-002 (UI stack), ADR-005 (monorepo layout reserves slots for `desktop-shell` and `mobile-shell`).
