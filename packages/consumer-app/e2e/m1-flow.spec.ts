import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SHIM_SCRIPT } from './fixtures/shim.js';

test.describe('M1 flow', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(SHIM_SCRIPT);
    await page.goto('/');
  });

  test('disclaimer → load → play → panic → grounding', async ({ page }) => {
    // 1. Disclaimer modal is present.
    await expect(page.getByRole('button', { name: /I understand. Continue./i })).toBeVisible();

    // 2. Acknowledge.
    await page.getByRole('button', { name: /I understand. Continue./i }).click();

    // 3. M1 demo is visible; engine state is 'idle' (or 'initializing'
    //    the brief moment before the InMemoryHost posts the `ready`
    //    ack). Wait for the transition.
    await expect(page.getByTestId('m1-engine-state')).toHaveText(/idle|initializing/);
    await expect(page.getByTestId('m1-load')).toBeVisible();

    // 4. Load pack. packClient.unlock + engine.loadRoadmap must both
    //    resolve before Play becomes enabled.
    await page.getByTestId('m1-load').click();
    await expect(page.getByTestId('m1-play')).toBeEnabled();

    // 5. Play. Engine state progresses to 'playing'.
    await page.getByTestId('m1-play').click();
    await expect(page.getByTestId('m1-engine-state')).toHaveText('playing');

    // 6. levelDb indicator renders a numeric value (or the silence
    //    sentinel). Either way, the telemetry path is live.
    const levelText = await page.getByTestId('m1-level-db').textContent();
    expect(levelText).toMatch(/dBFS/);

    // 7. Panic via Escape.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('m1-engine-state')).toHaveText(/panicking|panicked/);

    // 8. After the fade, state is 'panicked' and Grounding is visible.
    await expect(page.getByTestId('m1-engine-state')).toHaveText('panicked', { timeout: 2_000 });
    await expect(page.getByTestId('m1-grounding')).toBeVisible();
  });

  test('disclaimer acknowledgement persists across reload', async ({ page }) => {
    await page.getByRole('button', { name: /I understand. Continue./i }).click();
    await page.reload();
    await expect(page.getByTestId('m1-load')).toBeVisible();
  });

  test('pause + play returns engine to playing state', async ({ page }) => {
    await page.getByRole('button', { name: /I understand. Continue./i }).click();
    await page.getByTestId('m1-load').click();
    await expect(page.getByTestId('m1-play')).toBeEnabled();
    await page.getByTestId('m1-play').click();
    await expect(page.getByTestId('m1-engine-state')).toHaveText('playing');
    await page.getByTestId('m1-pause').click();
    await expect(page.getByTestId('m1-engine-state')).toHaveText('idle');
    await page.getByTestId('m1-play').click();
    await expect(page.getByTestId('m1-engine-state')).toHaveText('playing');
  });

  test('a11y: no critical/serious axe violations on the M1 demo screen', async ({ page }) => {
    await page.getByRole('button', { name: /I understand. Continue./i }).click();
    await expect(page.getByTestId('m1-load')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
