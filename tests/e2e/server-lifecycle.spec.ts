import { expect, test } from './support/app-fixture';

test.describe('Server Lifecycle', () => {
  test.beforeEach(async ({ app }) => {
    await app.gotoApp();
  });

  test('creates a new server and shows it in the server list', async ({ page }) => {
    await page.locator('[data-testid="create-server-button"]').click();
    await expect(page.locator('[data-testid="add-server-choice-modal"]')).toBeVisible({
      timeout: 5_000,
    });

    await page.locator('[data-testid="choice-new-server-button"]').click();
    const modal = page.locator('[data-testid="add-server-modal"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await modal.locator('[data-testid="server-name-input"]').fill('e2e-test-server');
    await modal.locator('[data-testid="server-port-input"]').fill('25599');
    await modal.locator('[data-testid="server-memory-input"]').fill('2');
    await modal.locator('[data-testid="save-server-button"]').click();

    await expect(modal).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('[data-testid^="server-card-"]').last()).toBeVisible({
      timeout: 15_000,
    });
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
    await page.locator(`[data-testid="delete-server-${serverId}"]`).click({ timeout: 5_000 });

    await expect(serverCard).toHaveCount(0, { timeout: 10_000 });
  });

  test('requires EULA consent on the first start and continues the same request', async ({
    page,
    app,
  }) => {
    const serverId = await app.createServer({ serverId: 'e2e-eula-first-start' });
    await app.selectServer(serverId);
    await app.clearCalls();

    await page.locator('[data-testid="server-start-button"]').click();
    const modal = page.locator('[data-testid="server-eula-modal"]');
    await expect(modal).toBeVisible();
    await expect(page.locator('[data-testid="server-eula-accept"]')).toBeDisabled();

    await page.locator('[data-testid="server-eula-checkbox"]').check();
    await expect(page.locator('[data-testid="server-eula-accept"]')).toBeEnabled();
    await page.locator('[data-testid="server-eula-accept"]').click();

    await expect(modal).toHaveCount(0, { timeout: 10_000 });
    await expect
      .poll(async () => (await app.ipcCalls('start_server')).length, { timeout: 10_000 })
      .toBe(1);
    await expect
      .poll(
        async () =>
          page.evaluate((id) => {
            const runtime = (
              window as Window & {
                __MC_VECTOR_E2E__?: { state: { files: Record<string, { content?: string }> } };
              }
            ).__MC_VECTOR_E2E__;
            return runtime?.state.files[`/mock/app-data/servers/${id}/eula.txt`]?.content;
          }, serverId),
        { timeout: 10_000 },
      )
      .toBe('eula=true\n');
  });

  test('cancelling EULA consent does not start the server and can be retried', async ({
    page,
    app,
  }) => {
    const serverId = await app.createServer({ serverId: 'e2e-eula-cancel' });
    await app.selectServer(serverId);
    await app.clearCalls();

    await page.locator('[data-testid="server-start-button"]').click();
    await expect(page.locator('[data-testid="server-eula-modal"]')).toBeVisible();
    await page.locator('[data-testid="server-eula-cancel"]').click();
    await expect(page.locator('[data-testid="server-eula-modal"]')).toHaveCount(0);
    await expect.poll(async () => (await app.ipcCalls('start_server')).length).toBe(0);

    await page.locator('[data-testid="server-start-button"]').click();
    await expect(page.locator('[data-testid="server-eula-modal"]')).toBeVisible();
  });

  test('starts an existing accepted server without showing the EULA modal', async ({
    page,
    app,
  }) => {
    await app.gotoApp('paper-plugin-success');
    await app.selectServer('server-1');
    await app.clearCalls();

    await page.locator('[data-testid="server-start-button"]').click();
    await expect(page.locator('[data-testid="server-eula-modal"]')).toHaveCount(0);
    await expect
      .poll(async () => (await app.ipcCalls('start_server')).length, { timeout: 10_000 })
      .toBe(1);
  });

  test('bulk start skips a cancelled EULA server and continues with the next server', async ({
    page,
    app,
  }) => {
    const firstServerId = await app.createServer({ serverId: 'e2e-bulk-eula-one' });
    const secondServerId = await app.createServer({ serverId: 'e2e-bulk-eula-two' });
    await app.clearCalls();

    await page.locator('[data-testid="server-list"] .app-sidebar__servers-title button').click();
    await page.locator(`[data-testid="server-card-${firstServerId}"]`).click();
    await page.locator(`[data-testid="server-card-${secondServerId}"]`).click();
    await page.locator('[data-testid="bulk-start-button"]').click();

    await expect(page.locator('[data-testid="server-eula-modal"]')).toBeVisible();
    await page.locator('[data-testid="server-eula-cancel"]').click();
    await expect(page.locator('[data-testid="server-eula-modal"]')).toBeVisible();
    await page.locator('[data-testid="server-eula-checkbox"]').check();
    await page.locator('[data-testid="server-eula-accept"]').click();

    await expect(page.locator('[data-testid="server-eula-modal"]')).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect
      .poll(async () => (await app.ipcCalls('start_server')).length, { timeout: 10_000 })
      .toBe(1);
  });
});
