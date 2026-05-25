import { expect, test } from '@playwright/test';

test.describe('Server creation modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-root"]', { timeout: 15_000 });
  });

  test('create server button is visible in sidebar', async ({ page }) => {
    await expect(
      page.locator('[data-testid="create-server-button"]'),
    ).toBeVisible();
  });

  test('clicking create server opens choice modal', async ({ page }) => {
    await page.locator('[data-testid="create-server-button"]').click();

    await expect(
      page.locator('[data-testid="add-server-choice-modal"]'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('choice modal has new server and import options', async ({ page }) => {
    await page.locator('[data-testid="create-server-button"]').click();

    const modal = page.locator('[data-testid="add-server-choice-modal"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await expect(modal.locator('[data-testid="choice-new-server-button"]')).toBeVisible();
    await expect(
      modal.locator('[data-testid="choice-import-server-button"]'),
    ).toBeVisible();
  });

  test('new server button opens add server form', async ({ page }) => {
    await page.locator('[data-testid="create-server-button"]').click();
    await page.locator('[data-testid="choice-new-server-button"]').click();

    await expect(
      page.locator('[data-testid="add-server-modal"]'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('add server modal has required form fields', async ({ page }) => {
    await page.locator('[data-testid="create-server-button"]').click();
    await page.locator('[data-testid="choice-new-server-button"]').click();

    const modal = page.locator('[data-testid="add-server-modal"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await expect(modal.locator('[data-testid="server-name-input"]')).toBeVisible();
  });

  test('can cancel the add server modal', async ({ page }) => {
    await page.locator('[data-testid="create-server-button"]').click();
    await page.locator('[data-testid="choice-new-server-button"]').click();

    const modal = page.locator('[data-testid="add-server-modal"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await modal.locator('[data-testid="cancel-server-button"]').click();

    await expect(modal).toHaveCount(0);
  });
});
