import { expect, test } from './support/app-fixture';

const SERVER_VIEWS = [
  ['dashboard', 'dashboard-view'],
  ['console', 'console-view'],
  ['users', 'users-view'],
  ['files', 'files-view'],
  ['plugins', 'plugin-browser'],
  ['backups', 'backups-view'],
  ['properties', 'properties-view'],
  ['general-settings', 'server-settings-view'],
] as const;

test.describe('application shell', () => {
  test('opens every primary view and preserves the active navigation state', async ({
    page,
    app,
  }) => {
    await app.gotoApp('paper-plugin-success');

    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-main"]')).toBeVisible();

    for (const [view, rootTestId] of SERVER_VIEWS) {
      await app.openView(view);
      await expect(page.locator(`[data-testid="nav-item-${view}"]`)).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.locator(`[data-testid="${rootTestId}"]`)).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test('opens application settings from the brand and proxy help from proxy setup', async ({
    page,
    app,
  }) => {
    await app.gotoApp('paper-plugin-success');

    await app.openView('app-settings');
    await expect(page.locator('[data-testid="app-settings-view"]')).toBeVisible();

    await app.openView('proxy');
    await expect(page.locator('[data-testid="proxy-view"]')).toBeVisible();
    await page.locator('[data-testid="proxy-view-help-button"]').click();
    await expect(page.locator('[data-testid="proxy-help-view"]')).toBeVisible();
  });

  test('sidebar can be collapsed and expanded without losing navigation', async ({ page, app }) => {
    await app.gotoApp('paper-plugin-success');
    const sidebar = page.locator('[data-testid="app-sidebar"]');
    await page.locator('[data-testid="sidebar-toggle-button"]').click();
    await expect(sidebar).toHaveClass(/app-sidebar--collapsed/);
    await page.locator('[data-testid="sidebar-toggle-button"]').click();
    await expect(sidebar).toHaveClass(/app-sidebar--open/);
    await app.openView('plugins');
    await expect(page.locator('[data-testid="plugin-browser"]')).toBeVisible();
  });
});
