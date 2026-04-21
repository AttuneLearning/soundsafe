// Web implementation of @soundsafe/platform.
// M0: identifies itself + provides a working KeybindService. Other services
// (AudioService, PackService, EntitlementService, …) land in M1+.

import type { Platform, CreatePlatform } from '../src/index';
import { createWebKeybindService } from './keybind';

export const createPlatform: CreatePlatform = (): Platform => ({
  name: 'web',
  keybind: createWebKeybindService(),
});
