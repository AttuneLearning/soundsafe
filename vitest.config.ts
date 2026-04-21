import { defineConfig } from 'vitest/config';

// Workspace-wide vitest config. Each package's `pnpm test` script runs
// `vitest run` and inherits this config. Tests live in `**/__tests__/`
// directories or alongside source as `*.test.ts(x)`.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    environment: 'node',
    globals: false,
    reporters: ['default'],
  },
});
