# ADR-021: Platform abstraction via `@soundsafe/platform` with build-time shell selection

**Status:** Accepted
**Date:** 2026-04-20
**Domain:** Frontend

## Context

ADR-001 ships v1 as Web/PWA with Tauri desktop and eventual mobile deferred. The UI code must be able to reach native capabilities on future shells (filesystem dialogs, OS keychain, native toast, global hotkeys, cpal-driven audio) without rewrites when those shells arrive.

Two approaches:
1. **Runtime feature detection** — `if (window.__TAURI__) { … }` sprinkled through the app, with dynamic imports gated by environment checks.
2. **Build-time shell selection** — a single platform abstraction package with pluggable implementations, resolved by the bundler at build time based on an env variable.

Runtime detection leaks platform concerns into components, makes bundle analysis dishonest (every shell's code ends up in every bundle unless manually tree-shaken), and risks calling a Tauri-only API on the web when a detection check is missed.

## Decision

Adopt a `@soundsafe/platform` package with **build-time implementation selection**. Vite resolves `createPlatform()` imports to one of `web/`, `tauri/`, or `mobile/` based on `SOUNDSAFE_PLATFORM` env. Web bundles never contain Tauri imports; Tauri bundles never contain mobile-shell imports.

### Service surface

```
packages/platform/
  src/
    index.ts              # interfaces + createPlatform() entry
    audio/                # AudioService interface
    pack/                 # PackService
    entitlement/          # EntitlementService
    storage/              # KvStore, BlobStore, SecretStore
    telemetry/            # TelemetryService (local-only, ADR-011)
    keybind/              # KeybindService
    presentation/         # toast / modal / haptic
    fs/                   # roadmap JSON import/export
    platform-context.tsx  # React provider + hook
  web/                    # v1 implementation (shipped)
  tauri/                  # reserved — not built in v1
  mobile/                 # reserved — not built in v1
```

Cross-cutting rules:
- **Audio core is shell-agnostic.** DSP/safety/roadmap-engine live in Rust/WASM (ADR-002, ADR-016) and run identically in any shell. Only the output sink differs: web uses AudioWorklet→Web Audio; Tauri will swap the worklet for a cpal-driven Rust host.
- **Service Worker is web-only.** Tauri has native filesystem + no SW. Mobile inherits web's SW with documented iOS quirks.
- **Storage parity.** IndexedDB + OPFS on every shell for v1 and v2 of the Tauri shell — this gives behavioral parity. Tauri may later upgrade `SecretStore` to OS keychain (`stronghold` plugin); KV + Blob stay on IDB + OPFS.
- **Global hotkeys on Tauri default-on.** `Esc` (panic) + `G` (grounding) registered as global hotkeys when the app is backgrounded, with a user-disableable setting. Rationale: a user under distress may have focus elsewhere.
- **Mobile entitlement.** App Store / Play Store may require IAP. `EntitlementService.startCheckout` returns `Promise<void>` that resolves when entitlement updates, not a Stripe redirect URL — so the mobile shell can substitute store-purchase without changing the interface.

## Consequences

### Positive
- Web bundles are genuinely web-only; bundle analyzer reports honest sizes.
- Adding the Tauri shell later is a build target, not a refactor.
- Component code never checks the platform — if a service exists, its methods work.
- Mobile IAP vs. Stripe can swap cleanly when that shell is scoped.

### Negative / trade-offs
- Interfaces must be designed for the union of platform capabilities now; narrow interfaces that fit web risk leaking later when Tauri wants more.
- Build configuration grows (one config per shell). Vite handles this cleanly but it's real surface.
- Tauri-specific features (system tray panic, global hotkeys) cannot be "added" by users of the web app even as opt-in. That's the price of build-time selection.

### Neutral / to watch
- The `EntitlementService.startCheckout: Promise<void>` shape commits to a callback-less entitlement update flow. If Stripe's web redirect forces us to return a URL from `startCheckout`, the interface will need to absorb that without breaking Tauri/mobile.
- `PresentationService.haptic` is a web no-op (beyond `navigator.vibrate`). Getting richer haptic on mobile may expose whether the `'tap' | 'warn' | 'panic'` enum is fine-grained enough.

## Alternatives considered

- **Runtime feature detection.** Rejected for bundle honesty and reliability reasons above.
- **One package per shell** (no shared abstraction). Rejected: the consumer app would have to conditionally import; the whole point is the component code is platform-agnostic.
- **Monolithic `platform-web` with TODOs for other shells.** Rejected: the interfaces should be authored now with shell variability in mind; authoring them after Tauri lands is a refactor.

## References

- ADR-001 (Web/PWA for MVP; Tauri/mobile later)
- ADR-002 (React + TS + wasm-bindgen)
- ADR-011 (local-only progress)
- Plan: `/home/adam/.claude/plans/distributed-napping-lemon.md` §Platform abstraction
