// KeybindService — register keyboard shortcuts. Per ADR-015 + plan, the
// panic-stop binding (`Esc`) must fire even when focus is in a text input,
// must blur the active element before invoking the handler, and must call
// stopImmediatePropagation so a downstream listener cannot eat it.
//
// Web v1 implements via document-level keydown. Tauri (later) registers
// global hotkeys via the `global-shortcut` plugin when `global: true`.
// Mobile webview ignores `global` (no global hotkeys); the affordance is
// always also visible as a button.

export interface KeyCombo {
  /**
   * `KeyboardEvent.key` value, e.g. 'Escape', 'g', 'Space', 'ArrowUp'.
   * Compared case-insensitively for letter keys.
   */
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface KeybindOptions {
  /**
   * Allow the binding to fire even when focus is in an input/textarea/
   * contenteditable. For panic-class bindings, set true and the web
   * implementation will also blur the active element before invoking the
   * handler. Default: false.
   */
  allowInInputs?: boolean;
  /**
   * Register as a global hotkey on shells that support it (Tauri).
   * Web ignores this flag entirely. Default: false.
   */
  global?: boolean;
}

export type Unsubscribe = () => void;

export interface KeybindService {
  register(
    id: string,
    combo: KeyCombo,
    handler: (event: KeyboardEvent) => void,
    options?: KeybindOptions,
  ): Unsubscribe;
}
