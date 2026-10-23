import { expect, test } from './support/app-fixture';

test.describe('settings and properties', () => {
  test('persists general settings through the settings screen', async ({ page, app }) => {
    await app.gotoApp('paper-plugin-success');
    await app.openView('app-settings');

    const settings = page.locator('[data-testid="settings-window"]');
    await expect(settings).toBeVisible();

    const language = settings.locator('#language-select');
    await language.selectOption('ja');
    await expect(language).toHaveValue('ja');
    await language.selectOption('en');
    await expect(language).toHaveValue('en');

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
    const motd = properties.locator('.properties-view__motd-input');
    await motd.fill('E2E properties update');
    const save = properties.getByRole('button', { name: 'Save Changes', exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText('Properties saved', { exact: true })).toBeVisible();
    await expect.poll(async () => (await app.ipcCalls('write_managed_text_file')).length).toBe(1);
  });
});
