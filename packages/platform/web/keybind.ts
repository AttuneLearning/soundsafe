import type {
  KeybindService,
  KeyCombo,
  KeybindOptions,
  Unsubscribe,
} from '../src/keybind.ts';

const INPUT_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  // Letter keys: case-insensitive. Other keys: exact match on event.key.
  const isLetter = combo.key.length === 1 && /[a-z]/i.test(combo.key);
  const keyMatch = isLetter
    ? event.key.toLowerCase() === combo.key.toLowerCase()
    : event.key === combo.key;
  if (!keyMatch) return false;
  if (Boolean(combo.ctrl) !== event.ctrlKey) return false;
  if (Boolean(combo.meta) !== event.metaKey) return false;
  if (Boolean(combo.shift) !== event.shiftKey) return false;
  if (Boolean(combo.alt) !== event.altKey) return false;
  return true;
}

function isInInput(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return target.matches(INPUT_SELECTOR);
}

export function createWebKeybindService(): KeybindService {
  return {
    register(
      _id: string,
      combo: KeyCombo,
      handler: (event: KeyboardEvent) => void,
      options: KeybindOptions = {},
    ): Unsubscribe {
      const allowInInputs = options.allowInInputs ?? false;

      const listener = (event: KeyboardEvent) => {
        if (!matchesCombo(event, combo)) return;

        if (!allowInInputs && isInInput(event)) {
          return;
        }

        // Panic-class bindings: blur the active element so the next
        // keystroke doesn't continue editing whatever they were typing in.
        if (allowInInputs) {
          const active = document.activeElement;
          if (active instanceof HTMLElement) {
            active.blur();
          }
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        handler(event);
      };

      // Use capture phase so we win against application-level listeners
      // that might also bind Esc (modals, menus). Panic must always reach
      // its handler.
      document.addEventListener('keydown', listener, { capture: true });
      return () =>
        document.removeEventListener('keydown', listener, { capture: true });
    },
  };
}
