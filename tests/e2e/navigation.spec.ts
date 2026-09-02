import { expect, test } from './support/app-fixture';

const NAVIGABLE_VIEWS = ['dashboard', 'console', 'files', 'plugins', 'backups'] as const;

test.describe('Navigation', () => {
  test.beforeEach(async ({ app }) => {
    await app.gotoApp();
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
    await expect(page.locator('[data-testid="nav-item-dashboard"]')).toHaveClass(/is-active/);

    await page.locator('[data-testid="nav-item-console"]').click();
    await expect(page.locator('[data-testid="nav-item-console"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-testid="nav-item-dashboard"]')).toHaveClass(/is-idle/);
  });
});
