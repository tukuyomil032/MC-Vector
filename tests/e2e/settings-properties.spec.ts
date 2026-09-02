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
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const runtime = (
            window as Window & {
              __MC_VECTOR_E2E__?: { state: { config: Record<string, unknown> } };
            }
          ).__MC_VECTOR_E2E__;
          return runtime?.state.config.liquidGlassEnabled;
        });
      })
      .toBe(true);

    const allowUnverified = settings.locator('#allow-unverified-plugin-downloads');
    await expect(allowUnverified).not.toBeChecked();
    await allowUnverified.check();
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const runtime = (
            window as Window & {
              __MC_VECTOR_E2E__?: { state: { config: Record<string, unknown> } };
            }
          ).__MC_VECTOR_E2E__;
          return runtime?.state.config.allowUnverifiedPluginDownloads;
        });
      })
      .toBe(true);
    await expect(allowUnverified).toBeChecked();
    await expect(app.ipcCalls('download_plugin_artifact')).resolves.toHaveLength(0);
  });

  test('edits server properties and opens the managed Java manager', async ({ page, app }) => {
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

    await app.openView('general-settings');
    await page.locator('[data-testid="server-settings-java-manage-button"]').click();
    const javaDialog = page.locator('[data-testid="java-manager-dialog"]');
    await expect(javaDialog).toBeVisible();
    await javaDialog.locator('[data-testid="java-download-17"]').click();
    await expect(javaDialog.getByText('Java 17', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(async () => (await app.ipcCalls('download_java')).length).toBe(1);
  });
});
