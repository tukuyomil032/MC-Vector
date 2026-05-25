import { expect, test } from '@playwright/test';

test.describe('Server Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-root"]', { timeout: 15_000 });
  });

  test('creates a new server and shows it in the server list', async ({
    page,
  }) => {
    await page.locator('[data-testid="create-server-button"]').click();
    await expect(
      page.locator('[data-testid="add-server-choice-modal"]'),
    ).toBeVisible({ timeout: 5_000 });

    await page.locator('[data-testid="choice-new-server-button"]').click();
    const modal = page.locator('[data-testid="add-server-modal"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await modal.locator('[data-testid="server-name-input"]').fill('e2e-test-server');
    await modal.locator('[data-testid="server-port-input"]').fill('25599');
    await modal.locator('[data-testid="server-memory-input"]').fill('2');
    await modal.locator('[data-testid="save-server-button"]').click();

    await expect(modal).toHaveCount(0, { timeout: 15_000 });
    await expect(
      page.locator('[data-testid^="server-card-"]').last(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('deletes a server via context menu', async ({ page }) => {
    // Create a server to delete
    await page.locator('[data-testid="create-server-button"]').click();
    await page.locator('[data-testid="choice-new-server-button"]').click();
    const modal = page.locator('[data-testid="add-server-modal"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await modal.locator('[data-testid="server-name-input"]').fill('e2e-delete-server');
    await modal.locator('[data-testid="server-port-input"]').fill('25597');
    await modal.locator('[data-testid="server-memory-input"]').fill('2');
    await modal.locator('[data-testid="save-server-button"]').click();
    await expect(modal).toHaveCount(0, { timeout: 15_000 });

    const serverCards = page.locator('[data-testid^="server-card-"]');
    await expect(serverCards.last()).toBeVisible({ timeout: 15_000 });

    const testid = await serverCards.last().getAttribute('data-testid');
    const serverId = testid?.replace('server-card-', '');
    expect(serverId).toBeTruthy();

    // Allow the dialog mock to confirm deletion
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__dialogConfirm = true;
    });

    const serverCard = page.locator(`[data-testid="server-card-${serverId}"]`);
    await serverCard.click({ button: 'right' });
    await page
      .locator(`[data-testid="delete-server-${serverId}"]`)
      .click({ timeout: 5_000 });

    await expect(serverCard).toHaveCount(0, { timeout: 10_000 });
  });
});
