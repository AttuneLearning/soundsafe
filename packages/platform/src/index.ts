// @soundsafe/platform — cross-shell platform abstraction (ADR-021).
//
// Pure interfaces + a `createPlatform()` factory. Build-time shell selection
// via the `SOUNDSAFE_PLATFORM` env (resolved by the bundler). Web bundles
// must never contain Tauri/mobile imports.
//
// Service interfaces are stubs in M0; they grow alongside the consumer-app
// in M1+ as each surface gets wired.

export interface Platform {
  readonly name: 'web' | 'tauri' | 'mobile';
}

export type CreatePlatform = () => Platform;

// The bundler swaps this default export based on SOUNDSAFE_PLATFORM.
// In M0 the only impl is `./web`; that import resolves directly.
export { createPlatform } from '../web/index.ts';
