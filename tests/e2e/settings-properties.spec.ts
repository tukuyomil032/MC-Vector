import { expect, test } from './support/app-fixture';

test.describe('settings and properties', () => {
  test('persists general settings through the settings screen', async ({ page, app }) => {
    await app.gotoApp('paper-plugin-success');
    await app.openView('app-settings');

    const settings = page.locator('[data-testid="settings-window"]');
    await expect(settings).toBeVisible();

    const language = settings.locator('#language-select');
    await language.click();
    await page.getByRole('option', { name: '日本語' }).click();
    await expect(language).toContainText('日本語');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await language.click();
    await page.getByRole('option', { name: 'English' }).click();
    await expect(language).toContainText('English');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const liquidGlass = settings.locator('#liquid-glass-toggle');
    await liquidGlass.check();
    await expect.poll(async () => (await app.runtimeState())?.config.liquidGlassEnabled).toBe(true);
  });

  test('closes the settings screen when navigating to another view', async ({ page, app }) => {
    await app.gotoApp();
    await app.openView('app-settings');

    const settings = page.locator('[data-testid="settings-window"]');
    await expect(settings).toBeVisible({ timeout: 10_000 });

    await app.openView('dashboard');
    await expect(settings).toHaveCount(0);
  });

  test('edits and saves server properties', async ({ page, app }) => {
    await app.gotoApp('paper-plugin-success');
    await app.openView('properties');

    const properties = page.locator('[data-testid="properties-view"]');
    await expect(properties).toBeVisible();
    await expect
      .poll(async () => (await app.ipcCalls('get_server_properties')).length)
      .toBeGreaterThan(0);
    const motd = properties.locator('.properties-view__motd-input');
    await motd.fill('E2E properties update');
    const save = properties.getByRole('button', { name: 'Save Changes', exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText('Properties saved', { exact: true })).toBeVisible();
    await expect.poll(async () => (await app.ipcCalls('save_server_properties')).length).toBe(1);
    expect((await app.ipcCalls('save_server_properties'))[0].args).toMatchObject({
      serverId: 'server-1',
      updates: { motd: 'E2E properties update' },
    });
    expect(
      (await app.runtimeState())?.files['/mock/app-data/servers/server-1/server.properties']
        ?.content,
    ).toContain('motd=E2E properties update');
  });
});
