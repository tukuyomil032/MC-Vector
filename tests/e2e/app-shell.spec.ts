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

const SERVERLESS_NAV_VIEWS = ['dashboard', 'console', 'files', 'plugins', 'backups'] as const;

test.describe('application shell', () => {
  test('opens every primary view and preserves the active navigation state', async ({
    page,
    app,
  }) => {
    await app.gotoApp('paper-plugin-success');

    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-main"]')).toBeVisible();

    let previousView: string | null = null;
    for (const [view, rootTestId] of SERVER_VIEWS) {
      await app.openView(view);
      const navItem = page.locator(`[data-testid="nav-item-${view}"]`);
      await expect(navItem).toHaveAttribute('aria-current', 'page');
      await expect(navItem).toHaveClass(/is-active/);
      if (previousView) {
        await expect(page.locator(`[data-testid="nav-item-${previousView}"]`)).toHaveClass(
          /is-idle/,
        );
      }
      await expect(page.locator(`[data-testid="${rootTestId}"]`)).toBeVisible({
        timeout: 15_000,
      });
      previousView = view;
    }
  });

  test('renders the sidebar chrome and tracks the active navigation item without a server', async ({
    page,
    app,
  }) => {
    await app.gotoApp();

    await expect(page.locator('[data-testid="app-sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-main"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-sidebar-nav"]')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar-toggle-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar-brand-button"]')).toBeVisible();

    let previousView: string | null = null;
    for (const view of SERVERLESS_NAV_VIEWS) {
      const navItem = page.locator(`[data-testid="nav-item-${view}"]`);
      await expect(navItem).toBeVisible();
      await navItem.click();
      await expect(navItem).toHaveClass(/is-active/);
      if (previousView) {
        await expect(page.locator(`[data-testid="nav-item-${previousView}"]`)).toHaveClass(
          /is-idle/,
        );
      }
      previousView = view;
    }
  });

  test('opens application settings from the brand and the proxy view from the sidebar', async ({
    page,
    app,
  }) => {
    await app.gotoApp('paper-plugin-success');

    await app.openView('app-settings');
    await expect(page.locator('[data-testid="app-settings-view"]')).toBeVisible();

    await app.openView('proxy');
    await expect(page.locator('[data-testid="proxy-view"]')).toBeVisible();
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
