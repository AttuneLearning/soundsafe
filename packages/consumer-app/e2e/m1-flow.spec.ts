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

    // 3. M1 demo is visible.
    await expect(page.getByTestId('m1-load')).toBeVisible();

    // 4. Load pack (engine init resolves via shim ack → engine state becomes idle).
    await page.getByTestId('m1-load').click();
    await expect(page.getByTestId('m1-play')).toBeEnabled();

    // 5. Play.
    await page.getByTestId('m1-play').click();

    // 6. Panic via Escape key.
    await page.keyboard.press('Escape');

    // 7. After the fade, Grounding button is visible.
    await expect(page.getByTestId('m1-grounding')).toBeVisible({ timeout: 2_000 });
  });

  test('disclaimer acknowledgement persists across reload', async ({ page }) => {
    await page.getByRole('button', { name: /I understand. Continue./i }).click();
    await page.reload();
    await expect(page.getByTestId('m1-load')).toBeVisible();
  });

  test('pause + play returns engine to playing state with no stuck states', async ({ page }) => {
    await page.getByRole('button', { name: /I understand. Continue./i }).click();
    await page.getByTestId('m1-load').click();
    await expect(page.getByTestId('m1-play')).toBeEnabled();
    await page.getByTestId('m1-play').click();
    await page.getByTestId('m1-pause').click();
    await page.getByTestId('m1-play').click();
    // The engine should remain reachable — clicking Pause again should succeed.
    await expect(page.getByTestId('m1-pause')).toBeEnabled();
  });

  test('a11y: no critical/serious axe violations on the M1 demo screen', async ({ page }) => {
    await page.getByRole('button', { name: /I understand. Continue./i }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
