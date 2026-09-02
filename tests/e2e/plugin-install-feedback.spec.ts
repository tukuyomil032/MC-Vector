import type { Page } from '@playwright/test';
import { type AppFixture, expect, test } from './support/app-fixture';
import type { E2eScenario } from './support/e2e-runtime';

async function openPluginBrowser(page: Page, app: AppFixture, scenario: E2eScenario) {
  await app.gotoApp(scenario);
  await app.openView('plugins');
  await expect(page.locator('[data-testid="plugin-browser"]')).toBeVisible({ timeout: 15_000 });
}

async function runtimeFiles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const runtime = (
      window as Window & {
        __MC_VECTOR_E2E__?: { state: { files: Record<string, unknown> } };
      }
    ).__MC_VECTOR_E2E__;
    return runtime ? Object.keys(runtime.state.files) : [];
  });
}

test.describe('plugin install and feedback flows', () => {
  test('installs a Modrinth plugin to the final plugins jar path', async ({ page, app }) => {
    await openPluginBrowser(page, app, 'paper-plugin-success');
    const result = page.locator('[data-testid="plugin-result-veinminer-project"]');
    await expect(result).toBeVisible();
    await app.clearCalls();

    await page.locator('[data-testid="plugin-install-veinminer-project"]').click();
    await expect.poll(async () => (await app.ipcCalls('download_plugin_artifact')).length).toBe(1);
    await expect
      .poll(() => runtimeFiles(page))
      .toContain('/mock/app-data/servers/server-1/plugins/VeinMiner-1.21.4.jar');
    await expect(page.getByText('Installed: VeinMiner', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: /Installed \(1\)/ }).click();
    await expect(page.getByText('VeinMiner-1.21.4.jar', { exact: true })).toBeVisible();

    const calls = await app.ipcCalls('download_plugin_artifact');
    expect(calls).toHaveLength(1);
    const request = (calls[0].args as { request: Record<string, unknown> }).request;
    expect(request).toMatchObject({
      serverId: 'server-1',
      relativePath: 'plugins/VeinMiner-1.21.4.jar',
      provider: 'modrinth',
      url: 'https://cdn.modrinth.example/veinminer.jar',
      eventId: 'plugin-version-1',
    });
    expect(request).toHaveProperty('checksum');
    expect(JSON.stringify(request)).not.toContain('allowUnverifiedPluginDownloads');
    await expect
      .poll(() => runtimeFiles(page))
      .toContain('/mock/app-data/servers/server-1/plugins/VeinMiner-1.21.4.jar');
    expect((await runtimeFiles(page)).some((path) => path.includes('.tmp-'))).toBe(false);
    await app.expectNoIpcCall('move_managed_path');
  });

  test('uses mods for a Fabric install', async ({ page, app }) => {
    await openPluginBrowser(page, app, 'fabric-mod-success');
    await page.locator('[data-testid="plugin-install-veinminer-project"]').click();
    await expect
      .poll(() => runtimeFiles(page))
      .toContain('/mock/app-data/servers/server-1/mods/VeinMiner-1.21.4.jar');
    await expect(page.getByText('Installed: VeinMiner', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: /Installed \(1\)/ }).click();
    await expect(page.getByText('VeinMiner-1.21.4.jar', { exact: true })).toBeVisible();
    expect((await app.ipcCalls('download_plugin_artifact'))[0].args).toMatchObject({
      request: { relativePath: 'mods/VeinMiner-1.21.4.jar' },
    });
  });

  test('blocks an incompatible Hangar plugin before any install side effect', async ({
    page,
    app,
  }) => {
    await openPluginBrowser(page, app, 'incompatible-plugin');
    await page.locator('[data-testid="plugin-provider-hangar"]').click();
    const result = page.locator('[data-testid="plugin-result-Example/wireless-redstone"]');
    await expect(result).toBeVisible();
    await expect(result.getByText('Incompatible', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await app.clearCalls();

    await result.getByRole('button', { name: /install/i }).click();
    const dialog = page.locator('[data-testid="feedback-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('WirelessRedstone');
    await expect(dialog).toContainText('Paper 1.21.10');
    await expect(dialog).toContainText('1.20.1');
    await expect(dialog).toContainText('cannot be installed');
    await expect(dialog.getByRole('button', { name: /continue|proceed/i })).toHaveCount(0);
    await app.expectNoIpcCall('download_plugin_artifact');
    await app.expectNoIpcCall('move_managed_path');
    await app.expectNoIpcCall('delete_managed_path');

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('classifies hashless Spiget rejection as a security dialog and allows it after settings change', async ({
    page,
    app,
  }) => {
    await openPluginBrowser(page, app, 'hashless-plugin');
    await page.locator('[data-testid="plugin-provider-spigot"]').click();
    const result = page.locator('[data-testid="plugin-result-1"]');
    await expect(result).toBeVisible();
    await app.clearCalls();

    await result.locator('[data-testid="plugin-install-1"]').click();
    const dialog = page.locator('[data-testid="feedback-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Unverified plugin download blocked');
    await expect(dialog).toContainText('provider did not supply a checksum');
    await expect(page.getByText('Install error', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Open General Settings' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Open General Settings' }).click();
    await expect(page.locator('[data-testid="app-settings-view"]')).toBeVisible();
    const checkbox = page.locator('#allow-unverified-plugin-downloads');
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const runtime = (
            window as Window & {
              __MC_VECTOR_E2E__?: { state: { config: Record<string, unknown> } };
            }
          ).__MC_VECTOR_E2E__;
          return runtime?.state.config.allowUnverifiedPluginDownloads;
        }),
      )
      .toBe(true);

    await app.openView('plugins');
    await page.locator('[data-testid="plugin-provider-spigot"]').click();
    const retryResult = page.locator('[data-testid="plugin-result-1"]');
    await expect(retryResult).toBeVisible();
    await retryResult.locator('[data-testid="plugin-install-1"]').click();
    await expect
      .poll(() => runtimeFiles(page))
      .toContain('/mock/app-data/servers/server-1/plugins/veinminer-1.jar');
    await expect(page.getByText('Installed: VeinMiner', { exact: true })).toBeVisible();
    expect((await app.ipcCalls('download_plugin_artifact')).at(-1)?.args).toMatchObject({
      request: { provider: 'spiget', relativePath: 'plugins/veinminer-1.jar' },
    });
  });

  for (const scenario of ['checksum-mismatch', 'checksum-invalid'] as const) {
    test(`${scenario} opens a verification modal and does not install`, async ({ page, app }) => {
      await openPluginBrowser(page, app, scenario);
      await page.locator('[data-testid="plugin-install-veinminer-project"]').click();
      const dialog = page.locator('[data-testid="feedback-dialog"]');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Plugin integrity check failed');
      await expect(dialog).toContainText('not placed in the server folder');
      expect(
        (await runtimeFiles(page)).some((path) => /\/(?:plugins|mods)\/[^/]+\.jar$/i.test(path)),
      ).toBe(false);
    });
  }

  test('shows a retryable inline error for a transient network failure', async ({ page, app }) => {
    await openPluginBrowser(page, app, 'network-retry');
    const result = page.locator('[data-testid="plugin-result-veinminer-project"]');
    await result.locator('[data-testid="plugin-install-veinminer-project"]').click();
    const error = result.locator('[data-testid="plugin-install-error-veinminer-project"]');
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(result.getByText('Installed', { exact: true })).toHaveCount(0);

    await error.getByRole('button', { name: /retry/i }).click();
    await expect
      .poll(() => runtimeFiles(page))
      .toContain('/mock/app-data/servers/server-1/plugins/VeinMiner-1.21.4.jar');
    await expect(page.getByText('Installed: VeinMiner', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect((await app.ipcCalls('download_plugin_artifact')).length).toBe(2);
  });
});
