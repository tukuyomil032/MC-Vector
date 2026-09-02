import { expect, test } from './support/app-fixture';

test.describe('shared feedback policy', () => {
  test('renders an incompatible install as a blocking dialog with focus management', async ({
    page,
    app,
  }) => {
    await app.gotoApp('incompatible-plugin');
    await app.openView('plugins');
    await page.locator('[data-testid="plugin-provider-hangar"]').click();

    const result = page.locator('[data-testid="plugin-result-Example/wireless-redstone"]');
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: /install/i }).click();

    const dialog = page.locator('[data-testid="feedback-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog.getByRole('heading')).toBeVisible();
    await expect(dialog.getByLabel('Close')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /continue|proceed/i })).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest('[data-testid="feedback-dialog"]')),
        ),
      )
      .toBe(true);
    await app.expectNoIpcCall('download_plugin_artifact');

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('keeps transient network failure inline and retries only the install action', async ({
    page,
    app,
  }) => {
    await app.gotoApp('network-retry');
    await app.openView('plugins');

    const result = page.locator('[data-testid="plugin-result-veinminer-project"]');
    await result.locator('[data-testid="plugin-install-veinminer-project"]').click();
    const error = result.locator('[data-testid="plugin-install-error-veinminer-project"]');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(page.locator('[data-testid="feedback-dialog"]')).toHaveCount(0);
    await expect(page.getByText('Install error', { exact: true })).toHaveCount(0);

    await error.getByRole('button', { name: /retry/i }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(
            (
              window as Window & {
                __MC_VECTOR_E2E__?: { state: { files: Record<string, unknown> } };
              }
            ).__MC_VECTOR_E2E__?.state.files ?? {},
          ).some((path) => path.endsWith('/plugins/VeinMiner-1.21.4.jar')),
        ),
      )
      .toBe(true);
    await expect(
      page.locator('[data-testid="plugin-install-error-veinminer-project"]'),
    ).toHaveCount(0);
    expect((await app.ipcCalls('download_plugin_artifact')).length).toBe(2);
  });

  test('explains hashless rejection in a security dialog instead of a generic toast', async ({
    page,
    app,
  }) => {
    await app.gotoApp('hashless-plugin');
    await app.openView('plugins');
    await page.locator('[data-testid="plugin-provider-spigot"]').click();

    const result = page.locator('[data-testid="plugin-result-1"]');
    await result.locator('[data-testid="plugin-install-1"]').click();
    const dialog = page.locator('[data-testid="feedback-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Unverified plugin download blocked');
    await expect(dialog).toContainText('provider did not supply a checksum');
    await expect(dialog).not.toContainText('https://');
    await expect(dialog).not.toContainText('/mock/');
    await expect(page.getByText('Install error', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Open General Settings' })).toBeVisible();
    await expect(dialog.getByLabel('Close')).toBeVisible();
  });
});
