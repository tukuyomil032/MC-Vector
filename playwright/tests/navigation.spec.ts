import { expect, test } from '@playwright/test';

const NAVIGABLE_VIEWS = ['dashboard', 'console', 'files', 'plugins', 'backups'] as const;

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-root"]', { timeout: 15_000 });

    // ensure sidebar is open so nav items are visible & clickable
    const sidebar = page.locator('[data-testid="app-sidebar"]');
    const isOpen = await sidebar.evaluate((el) =>
      el.classList.contains('app-sidebar--open'),
    );
    if (!isOpen) {
      await page.locator('[data-testid="sidebar-toggle-button"]').click();
      await expect(sidebar).toHaveClass(/app-sidebar--open/);
    }
  });

  for (const view of NAVIGABLE_VIEWS) {
    test(`clicking nav-item-${view} updates the active state`, async ({ page }) => {
      const navItem = page.locator(`[data-testid="nav-item-${view}"]`);
      await expect(navItem).toBeVisible();
      await navItem.click();
      await expect(navItem).toHaveClass(/is-active/);
    });
  }

  test('main content area updates when switching views', async ({ page }) => {
    await page.locator('[data-testid="nav-item-dashboard"]').click();
    await expect(
      page.locator('[data-testid="nav-item-dashboard"]'),
    ).toHaveClass(/is-active/);

    await page.locator('[data-testid="nav-item-console"]').click();
    await expect(
      page.locator('[data-testid="nav-item-console"]'),
    ).toHaveClass(/is-active/);
    await expect(
      page.locator('[data-testid="nav-item-dashboard"]'),
    ).toHaveClass(/is-idle/);
  });
});
