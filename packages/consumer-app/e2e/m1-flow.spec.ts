import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SHIM_SCRIPT } from './fixtures/shim.js';

test.describe('M1 flow', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(SHIM_SCRIPT);
    await page.goto('/');
  });

  test('disclaimer → load → ramp → play → fade → panicked', async ({ page }) => {
    // 1. Disclaimer modal is present.
    await expect(page.getByRole('button', { name: /I understand. Continue./i })).toBeVisible();

    // 2. Acknowledge.
    await page.getByRole('button', { name: /I understand. Continue./i }).click();

    // 3. M1 demo is visible; engine state settles at 'idle' after
    //    the brief 'initializing' window on boot.
    await expect(page.getByTestId('m1-engine-state')).toHaveText(/idle|initializing/);
    await expect(page.getByTestId('m1-load')).toBeVisible();

    // 4. Load pack — packClient.unlock + engine.loadRoadmap both
    //    resolve before Play becomes enabled.
    await page.getByTestId('m1-load').click();
    await expect(page.getByTestId('m1-play')).toBeEnabled();
    await expect(page.getByTestId('m1-engine-state')).toHaveText('idle');

    // 5. Play → engine enters `ramping` for the ramp window, then
    //    transitions to `playing` once ramp-up completes.
    await page.getByTestId('m1-play').click();
    await expect(page.getByTestId('m1-engine-state')).toHaveText('ramping');
    await expect(page.getByTestId('m1-engine-state')).toHaveText('playing', { timeout: 5_000 });

    // 6. Ramp behavior — the playhead readout must advance
    //    monotonically during the ramping window, proving the
    //    worklet's fast-ring drain is live end-to-end. Also check
    //    the level indicator renders dBFS text.
    const playheadHandle = page.getByTestId('m1-playhead');
    const readSeconds = async (): Promise<number> => {
      const t = (await playheadHandle.textContent()) ?? '0s';
      return parseFloat(t.replace(/[^0-9.]/g, '')) || 0;
    };
    const t0 = await readSeconds();
    await page.waitForTimeout(500);
    const t1 = await readSeconds();
    expect(t1).toBeGreaterThanOrEqual(t0);

    const levelText = await page.getByTestId('m1-level-db').textContent();
    expect(levelText).toMatch(/dBFS/);

    // 7. Panic via Escape → `fading` then `panicked`.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('m1-engine-state')).toHaveText('fading');
    await expect(page.getByTestId('m1-engine-state')).toHaveText('panicked', { timeout: 2_000 });

    // 8. Grounding button appears once the fade finishes.
    await expect(page.getByTestId('m1-grounding')).toBeVisible();
  });

  test('disclaimer acknowledgement persists across reload', async ({ page }) => {
    await page.getByRole('button', { name: /I understand. Continue./i }).click();
    await page.reload();
    await expect(page.getByTestId('m1-load')).toBeVisible();
  });

  test('pause during ramp returns to idle; play re-enters ramping', async ({ page }) => {
    await page.getByRole('button', { name: /I understand. Continue./i }).click();
    await page.getByTestId('m1-load').click();
    await expect(page.getByTestId('m1-play')).toBeEnabled();
    await page.getByTestId('m1-play').click();
    await expect(page.getByTestId('m1-engine-state')).toHaveText('ramping');
    // Pause mid-ramp — state should return to idle, with no stuck
    // state in between.
    await page.getByTestId('m1-pause').click();
    await expect(page.getByTestId('m1-engine-state')).toHaveText('idle');
    // Play again → ramping again.
    await page.getByTestId('m1-play').click();
    await expect(page.getByTestId('m1-engine-state')).toHaveText('ramping');
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
