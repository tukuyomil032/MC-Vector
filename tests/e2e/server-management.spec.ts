import { expect, test } from './support/app-fixture';

test.describe('server management', () => {
  test('creates, selects, and updates a managed server through the UI', async ({ page, app }) => {
    await app.gotoApp();

    const serverId = await app.createServer({
      serverId: 'e2e-managed-server',
    });
    await app.selectServer(serverId);
    await app.openView('general-settings');

    const settings = page.locator('[data-testid="server-settings-view"]');
    await expect(settings).toBeVisible();
    const nameInput = page.locator('[data-testid="server-settings-name-input"]');
    await nameInput.fill('renamed-managed-server');
    await page.locator('[data-testid="server-settings-save-button"]').click();

    await expect(page.getByText('Settings saved', { exact: true })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await app.runtimeState())?.servers.find((server) => server.id === serverId)?.name,
      )
      .toBe('renamed-managed-server');
  });

  test('opens the native import flow from the add-server choice dialog', async ({ page, app }) => {
    await app.gotoApp();
    await page.locator('[data-testid="create-server-button"]').click();
    await page.locator('[data-testid="choice-import-server-button"]').click();
    await page.locator('[data-testid="choice-next-button"]').click();

    const modal = page.locator('[data-testid="import-server-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-testid="import-select-folder-button"]')).toBeVisible();
    await expect(modal.locator('[data-testid="import-server-submit"]')).toBeDisabled();
  });

  test('cancels the new-server form opened from the add-server choice dialog', async ({
    page,
    app,
  }) => {
    await app.gotoApp();
    await page.locator('[data-testid="create-server-button"]').click();
    await expect(page.locator('[data-testid="add-server-choice-modal"]')).toBeVisible();
    await page.locator('[data-testid="choice-new-server-button"]').click();
    await page.locator('[data-testid="choice-next-button"]').click();

    const modal = page.locator('[data-testid="add-server-modal"]');
    await expect(modal).toBeVisible();
    await modal.locator('[data-testid="cancel-server-button"]').click();

    await expect(modal).toHaveCount(0);
  });

  test('requires an explicit confirmation before deleting a server', async ({ page, app }) => {
    await app.gotoApp('paper-plugin-success');

    const serverCard = page.locator('[data-testid="server-card-server-1"]');
    await serverCard.click({ button: 'right' });
    await page.locator('[data-testid="delete-server-server-1"]').click();
    await expect(page.locator('[data-testid="feedback-dialog"]')).toContainText('server-1');
    await app.acceptConfirm();

    await expect(serverCard).toHaveCount(0);
    await expect.poll(async () => (await app.ipcCalls('delete_managed_server')).length).toBe(1);
  });
});
