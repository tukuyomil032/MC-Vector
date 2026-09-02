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
      .poll(() =>
        page.evaluate((id) => {
          const runtime = (
            window as Window & {
              __MC_VECTOR_E2E__?: {
                state: { servers: Array<{ id: string; name: string }> };
              };
            }
          ).__MC_VECTOR_E2E__;
          return runtime?.state.servers.find((server) => server.id === id)?.name;
        }, serverId),
      )
      .toBe('renamed-managed-server');
  });

  test('opens the native import flow from the add-server choice dialog', async ({ page, app }) => {
    await app.gotoApp();
    await page.locator('[data-testid="create-server-button"]').click();
    await page.locator('[data-testid="choice-import-server-button"]').click();

    const modal = page.locator('[data-testid="import-server-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-testid="import-select-folder-button"]')).toBeVisible();
    await expect(modal.locator('[data-testid="import-server-submit"]')).toBeDisabled();
  });

  test('requires the explicit native confirmation before deleting a server', async ({
    page,
    app,
  }) => {
    await app.gotoApp('paper-plugin-success');
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__dialogConfirm = true;
    });

    const serverCard = page.locator('[data-testid="server-card-server-1"]');
    await serverCard.click({ button: 'right' });
    await page.locator('[data-testid="delete-server-server-1"]').click();

    await expect(serverCard).toHaveCount(0);
    await expect.poll(async () => (await app.ipcCalls('delete_managed_server_dir')).length).toBe(1);
  });
});
