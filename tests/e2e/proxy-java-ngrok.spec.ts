import { expect, test } from './support/app-fixture';

test.describe('proxy, Java, and Ngrok flows', () => {
  test('builds a proxy network and opens the help view', async ({ page, app }) => {
    await app.gotoApp('proxy-flow');
    await app.openView('proxy');

    const proxy = page.locator('[data-testid="proxy-view"]');
    await expect(proxy).toBeVisible();
    await expect(proxy.locator('#proxy-setup-software')).toContainText('Velocity');
    await proxy.locator('#proxy-backend-server-1').check();

    await proxy.getByRole('button', { name: /Build Network/i }).click();
    await app.acceptConfirm();
    await expect(page.getByText(/Updated settings for 1 server/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(async () => (await app.ipcCalls('configure_proxy_network')).length).toBe(1);
    expect((await app.ipcCalls('configure_proxy_network'))[0].args).toMatchObject({
      request: {
        proxySoftware: 'Velocity',
        proxyPort: 25577,
        backendServerIds: ['server-1'],
      },
    });
    expect(
      (await app.runtimeState())?.files['/mock/app-data/servers/server-1/server.properties']
        ?.content,
    ).toContain('server-port=25566');

    await proxy.locator('[data-testid="proxy-view-help-button"]').click();
    await expect(page.locator('[data-testid="proxy-help-view"]')).toBeVisible();
  });

  test('downloads a managed Java runtime and starts an Ngrok tunnel', async ({ page, app }) => {
    await app.gotoApp('proxy-flow');
    await app.openView('general-settings');

    const settings = page.locator('[data-testid="server-settings-view"]');
    // World management lives in the general settings, below the ngrok card.
    await expect(settings.getByText('World Management', { exact: true })).toBeVisible();
    await settings.locator('[data-testid="server-settings-java-manage-button"]').click();
    const javaDialog = page.locator('[data-testid="java-manager-dialog"]');
    await expect(javaDialog).toBeVisible();
    await javaDialog.locator('[data-testid="java-download-21"]').click();
    await expect(javaDialog.getByText('Java 21', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(async () => (await app.ipcCalls('download_java')).length).toBe(1);
    await javaDialog.locator('[data-testid="java-manager-close"]').click();

    await settings.locator('[data-testid="ngrok-toggle"]').click();
    const tokenDialog = page.locator('[data-testid="ngrok-token-dialog"]');
    await expect(tokenDialog).toBeVisible();
    await tokenDialog.locator('[data-testid="ngrok-token-input"]').fill('e2e-token');
    await tokenDialog.locator('[data-testid="ngrok-token-save"]').click();
    await expect.poll(async () => (await app.ipcCalls('start_ngrok')).length).toBe(1);
    await expect(settings.getByText(/Online|接続中/i)).toBeVisible({ timeout: 15_000 });

    await settings.locator('[data-testid="ngrok-connection-guide-button"]').click();
    await expect(page.locator('[data-testid="ngrok-guide-view"]')).toBeVisible();
  });
});
