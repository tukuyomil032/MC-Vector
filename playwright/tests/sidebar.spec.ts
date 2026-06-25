import { expect, test } from '@playwright/test';

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-root"]', { timeout: 15_000 });
  });

  test('renders app shell with sidebar and main area', async ({ page }) => {
    await expect(page.locator('[data-testid="app-sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-main"]')).toBeVisible();
  });

  test('sidebar contains navigation items', async ({ page }) => {
    await expect(page.locator('[data-testid="app-sidebar-nav"]')).toBeVisible();

    const navItems = ['dashboard', 'console', 'files', 'plugins', 'backups'];
    for (const view of navItems) {
      await expect(page.locator(`[data-testid="nav-item-${view}"]`)).toBeVisible();
    }
  });

  test('sidebar toggle button is present', async ({ page }) => {
    await expect(
      page.locator('[data-testid="sidebar-toggle-button"]'),
    ).toBeVisible();
  });

  test('sidebar collapses when toggle is clicked', async ({ page }) => {
    const sidebar = page.locator('[data-testid="app-sidebar"]');
    const toggle = page.locator('[data-testid="sidebar-toggle-button"]');

    const isOpen = await sidebar.evaluate((el) =>
      el.classList.contains('app-sidebar--open'),
    );

    await toggle.click();

    if (isOpen) {
      await expect(sidebar).toHaveClass(/app-sidebar--collapsed/);
    } else {
      await expect(sidebar).toHaveClass(/app-sidebar--open/);
    }
  });

  test('sidebar brand button is present', async ({ page }) => {
    await expect(
      page.locator('[data-testid="sidebar-brand-button"]'),
    ).toBeVisible();
  });
});
