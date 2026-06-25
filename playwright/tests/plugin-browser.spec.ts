import { expect, test } from '@playwright/test';

test.describe('Plugin Browser UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-root"]', { timeout: 15_000 });
  });

  test('shows plugin browser when a server is selected and plugins nav is clicked', async ({
    page,
  }) => {
    // Create a server so server-dependent views are accessible
    await page.locator('[data-testid="create-server-button"]').click();
    await page.locator('[data-testid="choice-new-server-button"]').click();
    const modal = page.locator('[data-testid="add-server-modal"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await modal.locator('[data-testid="server-name-input"]').fill('e2e-plugin-test');
    await modal.locator('[data-testid="server-port-input"]').fill('25598');
    await modal.locator('[data-testid="server-memory-input"]').fill('2');
    await modal.locator('[data-testid="save-server-button"]').click();
    await expect(modal).toHaveCount(0, { timeout: 15_000 });

    // Select the created server
    const serverCard = page.locator('[data-testid^="server-card-"]').last();
    await expect(serverCard).toBeVisible({ timeout: 15_000 });
    await serverCard.click();

    // Navigate to plugins view
    await page.locator('[data-testid="nav-item-plugins"]').click();

    await expect(
      page.locator('[data-testid="plugin-browser"]'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('shows plugin search input in plugin browser', async ({ page }) => {
    // Create and select a server
    await page.locator('[data-testid="create-server-button"]').click();
    await page.locator('[data-testid="choice-new-server-button"]').click();
    const modal = page.locator('[data-testid="add-server-modal"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await modal.locator('[data-testid="server-name-input"]').fill('e2e-plugin-search-test');
    await modal.locator('[data-testid="server-port-input"]').fill('25596');
    await modal.locator('[data-testid="server-memory-input"]').fill('2');
    await modal.locator('[data-testid="save-server-button"]').click();
    await expect(modal).toHaveCount(0, { timeout: 15_000 });

    const serverCard = page.locator('[data-testid^="server-card-"]').last();
    await expect(serverCard).toBeVisible({ timeout: 15_000 });
    await serverCard.click();

    await page.locator('[data-testid="nav-item-plugins"]').click();

    await expect(
      page.locator('[data-testid="plugin-search-input"]'),
    ).toBeVisible({ timeout: 15_000 });
  });
});
