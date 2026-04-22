import { defineConfig, devices } from '@playwright/test';

// Playwright E2E configuration for the Soundsafe consumer app.
//
// - `webServer` boots Vite in dev mode so the COOP/COEP headers land.
// - `projects` pins to a single Chromium profile for M1; Firefox +
//   WebKit come in M2 once the fast-ring reader's SAB fallback for
//   non-COOP environments is understood.
// - The Web Audio shim is loaded via `contextOptions.serviceWorkers`
//   at the spec level (see `e2e/fixtures/shim.ts`).

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // FS-ISS-011: fresh runner with no retries. A flaky e2e should
  // surface as a red CI, not paper over itself.
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: 'pnpm dev',
        cwd: '.',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
