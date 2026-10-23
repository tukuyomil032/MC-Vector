import { expect, test } from './support/app-fixture';

test.describe('Server Lifecycle', () => {
  test.beforeEach(async ({ app }) => {
    await app.gotoApp();
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
          (await app.runtimeState())?.files[`/mock/app-data/servers/${serverId}/eula.txt`]?.content,
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
