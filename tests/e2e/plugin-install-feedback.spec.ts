import type { Page } from '@playwright/test';
import { type AppFixture, expect, test } from './support/app-fixture';
import type { E2eScenario } from './support/e2e-runtime';

async function openPluginBrowser(page: Page, app: AppFixture, scenario: E2eScenario) {
  await app.gotoApp(scenario);
  await app.openView('plugins');
  await expect(page.locator('[data-testid="plugin-browser"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="plugin-search-input"]')).toBeVisible({
    timeout: 15_000,
  });
}

async function confirmInstallPlan(page: Page) {
  const dialog = page.locator('[data-testid="feedback-dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('feedback-dialog-primary-action')).toBeVisible();
  await dialog.getByTestId('feedback-dialog-primary-action').click();
}

async function expectNoRendererOwnedArtifactData(app: AppFixture) {
  await app.expectNoIpcCall('download_plugin_artifact');
  const prepareCalls = await app.ipcCalls('prepare_plugin_install');
  for (const call of prepareCalls) {
    const serialized = JSON.stringify(call.args);
    expect(serialized).not.toMatch(/"(?:url|checksum|relativePath|eventId)"\s*:/i);
  }
}

test.describe('plugin install and feedback flows', () => {
  test('previews and installs a Modrinth artifact through a one-time Rust plan', async ({
    page,
    app,
  }) => {
    await openPluginBrowser(page, app, 'paper-plugin-success');
    const result = page.locator('[data-testid="plugin-result-veinminer-project"]');
    await expect(result).toBeVisible();
    await app.clearCalls();

    await page.locator('[data-testid="plugin-install-veinminer-project"]').click();
    const preview = page.locator('[data-testid="feedback-dialog"]');
    await expect(preview).toContainText('VeinMiner');
    await expect(preview).toContainText('VeinMiner-1.21.4.jar');
    await confirmInstallPlan(page);
    await expect
      .poll(() => app.runtimeFiles())
      .toContain('/mock/app-data/servers/server-1/plugins/VeinMiner-1.21.4.jar');
    await expect(page.getByText('Installed: VeinMiner', { exact: true })).toBeVisible();

    const prepare = await app.ipcCalls('prepare_plugin_install');
    expect(prepare).toHaveLength(1);
    expect(prepare[0].args).toMatchObject({
      request: {
        serverId: 'server-1',
        project: { provider: 'modrinth', projectId: 'veinminer-project' },
        replaceFileName: null,
      },
    });
    const execute = await app.ipcCalls('execute_plugin_install');
    expect(execute).toHaveLength(1);
    expect(execute[0].args).toMatchObject({
      request: { token: expect.any(String), confirmedDependencyIds: [] },
    });
    await expectNoRendererOwnedArtifactData(app);
    await app.expectNoIpcCall('move_managed_path');
    await app.expectNoIpcCall('delete_managed_path');
  });

  test('uses the Rust-selected mods directory for a Fabric install', async ({ page, app }) => {
    await openPluginBrowser(page, app, 'fabric-mod-success');
    await page.locator('[data-testid="plugin-install-veinminer-project"]').click();
    await confirmInstallPlan(page);
    await expect
      .poll(() => app.runtimeFiles())
      .toContain('/mock/app-data/servers/server-1/mods/VeinMiner-1.21.4.jar');
    expect((await app.ipcCalls('prepare_plugin_install'))[0].args).toMatchObject({
      request: { serverId: 'server-1', project: { projectId: 'veinminer-project' } },
    });
    await expectNoRendererOwnedArtifactData(app);
  });

  test('blocks an incompatible Hangar plugin before asking Rust to prepare an install', async ({
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
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog.getByRole('heading')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(dialog).toContainText('WirelessRedstone');
    await expect(dialog).toContainText('Paper 1.21.10');
    await expect(dialog).toContainText('1.20.1');
    await expect(dialog).toContainText('cannot be installed');
    await expect(dialog.getByTestId('feedback-dialog-primary-action')).toHaveCount(0);
    await app.expectNoIpcCall('prepare_plugin_install');
    await app.expectNoIpcCall('execute_plugin_install');
    await app.expectNoIpcCall('move_managed_path');
    await app.expectNoIpcCall('delete_managed_path');

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('requires the Rust unverified-download policy before installing a hashless Spiget plugin', async ({
    page,
    app,
  }) => {
    await openPluginBrowser(page, app, 'hashless-plugin');
    await page.locator('[data-testid="plugin-provider-spigot"]').click();
    const result = page.locator('[data-testid="plugin-result-1"]');
    await expect(result).toBeVisible();
    await app.clearCalls();

    await result.locator('[data-testid="plugin-install-1"]').click();
    const preview = page.locator('[data-testid="feedback-dialog"]');
    await expect(preview).toContainText('no provider checksum');
    await confirmInstallPlan(page);
    const blocked = page.locator('[data-testid="feedback-dialog"]');
    await expect(blocked).toContainText('Unverified plugin download blocked');
    await expect(blocked).toContainText('provider did not supply a checksum');
    await expect(blocked).not.toContainText('https://');
    await expect(blocked).not.toContainText('/mock/');
    await expect(page.getByText('Install error', { exact: true })).toHaveCount(0);
    await expect(blocked.getByRole('button', { name: 'Open General Settings' })).toBeVisible();

    await blocked.getByRole('button', { name: 'Open General Settings' }).click();
    await expect(page.locator('[data-testid="app-settings-view"]')).toBeVisible();
    const checkbox = page.locator('#allow-unverified-plugin-downloads');
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect
      .poll(async () => (await app.runtimeState())?.config.allowUnverifiedPluginDownloads)
      .toBe(true);

    await app.openView('plugins');
    await page.locator('[data-testid="plugin-provider-spigot"]').click();
    const retryResult = page.locator('[data-testid="plugin-result-1"]');
    await expect(retryResult).toBeVisible();
    await retryResult.locator('[data-testid="plugin-install-1"]').click();
    await confirmInstallPlan(page);
    await expect
      .poll(() => app.runtimeFiles())
      .toContain('/mock/app-data/servers/server-1/plugins/veinminer-1.jar');
    await expect(page.getByText('Installed: VeinMiner', { exact: true })).toBeVisible();
    expect((await app.ipcCalls('prepare_plugin_install'))[0].args).toMatchObject({
      request: { project: { provider: 'spiget', resourceId: 1 } },
    });
    expect(await app.ipcCalls('execute_plugin_install')).toHaveLength(2);
    await expectNoRendererOwnedArtifactData(app);
  });

  test('checksum mismatch leaves an existing plugin file untouched', async ({ page, app }) => {
    await openPluginBrowser(page, app, 'checksum-mismatch');
    await page.locator('[data-testid="plugin-install-veinminer-project"]').click();
    await confirmInstallPlan(page);
    const dialog = page.locator('[data-testid="feedback-dialog"]');
    await expect(dialog).toContainText('Plugin integrity check failed');
    await expect(dialog).toContainText('not placed in the server folder');
    expect(
      (await app.runtimeFiles()).some((path) => /\/(?:plugins|mods)\/[^/]+\.jar$/i.test(path)),
    ).toBe(false);
  });

  test('shows a retryable error and prepares a fresh plan after a network failure', async ({
    page,
    app,
  }) => {
    await openPluginBrowser(page, app, 'network-retry');
    const result = page.locator('[data-testid="plugin-result-veinminer-project"]');
    await result.locator('[data-testid="plugin-install-veinminer-project"]').click();
    await confirmInstallPlan(page);
    const error = result.locator('[data-testid="plugin-install-error-veinminer-project"]');
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(page.locator('[data-testid="feedback-dialog"]')).toHaveCount(0);
    await expect(page.getByText('Install error', { exact: true })).toHaveCount(0);
    await expect(result.getByText('Installed', { exact: true })).toHaveCount(0);

    await error.getByRole('button', { name: /retry/i }).click();
    await confirmInstallPlan(page);
    await expect
      .poll(() => app.runtimeFiles())
      .toContain('/mock/app-data/servers/server-1/plugins/VeinMiner-1.21.4.jar');
    await expect(
      page.locator('[data-testid="plugin-install-error-veinminer-project"]'),
    ).toHaveCount(0);
    await expect(page.getByText('Installed: VeinMiner', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect(await app.ipcCalls('prepare_plugin_install')).toHaveLength(2);
    expect(await app.ipcCalls('execute_plugin_install')).toHaveLength(2);
  });

  test('toggles and uninstalls installed files only through Rust commands', async ({
    page,
    app,
  }) => {
    await openPluginBrowser(page, app, 'paper-plugin-success');
    await page.locator('[data-testid="plugin-install-veinminer-project"]').click();
    await confirmInstallPlan(page);
    const enabledPath = '/mock/app-data/servers/server-1/plugins/VeinMiner-1.21.4.jar';
    const disabledPath = `${enabledPath}.disabled`;
    await expect.poll(() => app.runtimeFiles()).toContain(enabledPath);
    await page.getByRole('tab', { name: /Installed/ }).click();
    await page.getByRole('button', { name: 'Disable' }).click();
    await expect.poll(() => app.runtimeFiles()).toContain(disabledPath);
    await expect.poll(() => app.runtimeFiles()).not.toContain(enabledPath);
    expect(await app.ipcCalls('toggle_installed_plugin')).toHaveLength(1);

    await page.getByRole('button', { name: 'Enable' }).click();
    await expect.poll(() => app.runtimeFiles()).toContain(enabledPath);
    await expect.poll(() => app.runtimeFiles()).not.toContain(disabledPath);
    await page.getByRole('button', { name: 'Uninstall' }).click();
    await app.acceptConfirm();
    await expect.poll(() => app.runtimeFiles()).not.toContain(enabledPath);
    expect(await app.ipcCalls('uninstall_installed_plugin')).toHaveLength(1);
    await expectNoRendererOwnedArtifactData(app);
    await app.expectNoIpcCall('move_managed_path');
    await app.expectNoIpcCall('delete_managed_path');
  });
});
