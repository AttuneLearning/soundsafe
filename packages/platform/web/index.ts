// Web implementation of @soundsafe/platform.
// M0: minimal — just identifies itself. Real services land in M1+.

import type { Platform, CreatePlatform } from '../src/index.ts';

export const createPlatform: CreatePlatform = (): Platform => ({
  name: 'web',
});
