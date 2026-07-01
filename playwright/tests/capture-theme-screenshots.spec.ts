import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * This spec does not assert theme correctness — it is a design-review utility
 * that captures every screen so a human/agent can decide where to apply the
 * Liquid Glass effect in a follow-up phase. See docs/next-phase-plan.md.
 */

const SCREENSHOT_DIR = path.join(process.cwd(), 'playwright', 'screenshots');

const SERVER_SCOPED_VIEWS = [
  'dashboard',
  'console',
  'users',
  'files',
  'plugins',
  'backups',
  'properties',
  'general-settings',
] as const;

async function capture(page: import('@playwright/test').Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

test.describe('Liquid Glass screenshot capture', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('captures static (no-server) views', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-root"]', { timeout: 15_000 });

    await page.locator('[data-testid="sidebar-brand-button"]').click();
    await expect(page.locator('[data-testid="settings-window"]')).toBeVisible({
      timeout: 10_000,
    });
    await capture(page, 'app-settings');

    const sidebar = page.locator('[data-testid="app-sidebar"]');
    const isOpen = await sidebar.evaluate((el) => el.classList.contains('app-sidebar--open'));
    if (!isOpen) {
      await page.locator('[data-testid="sidebar-toggle-button"]').click();
    }

    await page.locator('[data-testid="nav-item-proxy"]').click();
    await expect(page.locator('[data-testid="nav-item-proxy"]')).toHaveClass(/is-active/);
    await capture(page, 'proxy');

    await page.locator('[data-testid="proxy-view-help-button"]').click();
    await capture(page, 'proxy-help');
  });

  test('captures server-scoped views', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-root"]', { timeout: 15_000 });

    await page.locator('[data-testid="create-server-button"]').click();
    await expect(page.locator('[data-testid="add-server-choice-modal"]')).toBeVisible({
      timeout: 5_000,
    });
    await page.locator('[data-testid="choice-new-server-button"]').click();

    const modal = page.locator('[data-testid="add-server-modal"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await modal.locator('[data-testid="server-name-input"]').fill('screenshot-capture-server');
    await modal.locator('[data-testid="server-port-input"]').fill('25598');
    await modal.locator('[data-testid="server-memory-input"]').fill('2');
    await modal.locator('[data-testid="save-server-button"]').click();
    await expect(modal).toHaveCount(0, { timeout: 15_000 });

    const serverCard = page.locator('[data-testid^="server-card-"]').last();
    await expect(serverCard).toBeVisible({ timeout: 15_000 });
    await serverCard.click();

    for (const view of SERVER_SCOPED_VIEWS) {
      const navItem = page.locator(`[data-testid="nav-item-${view}"]`);
      await expect(navItem).toBeVisible({ timeout: 10_000 });
      await navItem.click();
      await expect(navItem).toHaveClass(/is-active/);
      await capture(page, view);
    }

    // ngrok-guide is reached from within general-settings' ngrok panel.
    await page.locator('[data-testid="nav-item-general-settings"]').click();
    await page.locator('[data-testid="ngrok-connection-guide-button"]').click();
    await capture(page, 'ngrok-guide');
  });
});
