import { expect, test } from './support/app-fixture';

test.describe('proxy, Java, and Ngrok flows', () => {
  test('builds a proxy network and opens the help view', async ({ page, app }) => {
    await app.gotoApp('proxy-flow');
    await app.openView('proxy');

    const proxy = page.locator('[data-testid="proxy-view"]');
    await expect(proxy).toBeVisible();
    await expect(proxy.locator('#proxy-setup-software')).toHaveValue('Velocity');
    await proxy.locator('#proxy-backend-server-1').check();

    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__dialogConfirm = true;
    });
    await proxy.getByRole('button', { name: /Build Network/i }).click();
    await expect(page.getByText(/Updated settings for 1 server/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(async () => (await app.ipcCalls('write_managed_text_file')).length).toBe(1);

    await proxy.locator('[data-testid="proxy-view-help-button"]').click();
    await expect(page.locator('[data-testid="proxy-help-view"]')).toBeVisible();
  });

  test('downloads a managed Java runtime and starts an Ngrok tunnel', async ({ page, app }) => {
    await app.gotoApp('proxy-flow');
    await app.openView('general-settings');

    const settings = page.locator('[data-testid="server-settings-view"]');
    await settings.locator('[data-testid="server-settings-java-manage-button"]').click();
    const javaDialog = page.locator('[data-testid="java-manager-dialog"]');
    await expect(javaDialog).toBeVisible();
    await javaDialog.locator('[data-testid="java-download-21"]').click();
    await expect(javaDialog.getByText('Java 21', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(async () => (await app.ipcCalls('download_java')).length).toBe(1);
    await javaDialog.getByRole('button', { name: '×' }).click();

    await settings.locator('.server-settings__ngrok-switch').click();
    const tokenDialog = page.locator('.server-settings__token-panel');
    await expect(tokenDialog).toBeVisible();
    await tokenDialog.locator('[data-testid="ngrok-token-input"]').fill('e2e-token');
    await tokenDialog.locator('[data-testid="ngrok-token-save"]').click();
    await expect.poll(async () => (await app.ipcCalls('start_ngrok')).length).toBe(1);
    await expect(settings.getByText(/Online|接続中/i)).toBeVisible({ timeout: 15_000 });

    await settings.locator('[data-testid="ngrok-connection-guide-button"]').click();
    await expect(page.locator('[data-testid="ngrok-guide-view"]')).toBeVisible();
  });
});
