// @soundsafe/platform — cross-shell platform abstraction (ADR-021).
//
// Pure interfaces + a `createPlatform()` factory + a React `PlatformProvider`
// context. Build-time shell selection via `SOUNDSAFE_PLATFORM` (resolved by
// the bundler). Web bundles must never contain Tauri/mobile imports.
//
// Service interfaces grow alongside consumer-app needs in M1+.

export type { KeyCombo, KeybindOptions, KeybindService, Unsubscribe } from './keybind';

export interface Platform {
  readonly name: 'web' | 'tauri' | 'mobile';
  readonly keybind: import('./keybind').KeybindService;
}

export type CreatePlatform = () => Platform;

// Re-export the web factory + the React context bits. The bundler will swap
// `../web/index` for `../tauri/index` (etc.) when SOUNDSAFE_PLATFORM
// is set; M0 ships only `web/`.
export { createPlatform } from '../web/index';
export {
  PlatformProvider,
  usePlatform,
  PlatformContext,
} from './platform-context';
