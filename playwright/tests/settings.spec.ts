import { expect, test } from '@playwright/test';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-root"]', { timeout: 15_000 });
  });

  test('brand button opens settings view', async ({ page }) => {
    const brandBtn = page.locator('[data-testid="sidebar-brand-button"]');
    await expect(brandBtn).toBeVisible();
    await brandBtn.click();

    await expect(
      page.locator('[data-testid="settings-window"]'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('settings window contains language select', async ({ page }) => {
    await page.locator('[data-testid="sidebar-brand-button"]').click();

    const settingsWindow = page.locator('[data-testid="settings-window"]');
    await expect(settingsWindow).toBeVisible({ timeout: 10_000 });

    await expect(settingsWindow.locator('#language-select')).toBeVisible();
  });

  test('can return from settings by navigating to another view', async ({ page }) => {
    await page.locator('[data-testid="sidebar-brand-button"]').click();
    await expect(
      page.locator('[data-testid="settings-window"]'),
    ).toBeVisible({ timeout: 10_000 });

    // Navigate away — settings window should disappear
    await page.locator('[data-testid="nav-item-dashboard"]').click();

    await expect(
      page.locator('[data-testid="settings-window"]'),
    ).toHaveCount(0);
  });
});
