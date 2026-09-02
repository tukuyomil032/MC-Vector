import { expect, test } from './support/app-fixture';

async function runtimeFiles(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const runtime = (
      window as Window & {
        __MC_VECTOR_E2E__?: { state: { files: Record<string, unknown> } };
      }
    ).__MC_VECTOR_E2E__;
    return runtime ? Object.keys(runtime.state.files) : [];
  });
}

test.describe('files and backups', () => {
  test('navigates managed folders, creates a file, and opens the text editor', async ({
    page,
    app,
  }) => {
    await app.gotoApp('file-flow');
    await app.openView('files');

    await expect(page.locator('[data-testid="files-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="file-row-server.properties"]')).toBeVisible();
    await page.locator('[data-testid="file-row-world"]').dblclick();
    await expect(page.getByRole('button', { name: 'world', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'server-1', exact: true }).click();
    await expect(page.locator('[data-testid="file-row-server.properties"]')).toBeVisible();

    await page.locator('[data-testid="files-create-button"]').click();
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.locator('[data-testid="files-name-input"]').fill('e2e-created.txt');
    await page.locator('[data-testid="files-create-submit"]').click();
    await expect(page.locator('[data-testid="file-row-e2e-created.txt"]')).toBeVisible();

    await page.locator('[data-testid="file-row-server.properties"]').dblclick();
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  });

  test('creates and lists a backup from a selected managed file', async ({ page, app }) => {
    await app.gotoApp('backup-flow');
    await app.openView('backups');

    const backups = page.locator('[data-testid="backups-view"]');
    await expect(backups).toBeVisible();
    await expect(backups.getByText('World Management', { exact: true })).toBeVisible();
    await expect.poll(async () => (await app.ipcCalls('listen')).length).toBeGreaterThan(0);

    await app.setBackupSelection(['server.properties']);
    await backups.locator('[data-testid="backups-create-button"]').click();
    await backups.locator('[data-testid="backups-open-selector-button"]').click();
    await expect(backups.getByText('Selected: 1', { exact: true })).toBeVisible();

    await backups.locator('[data-testid="backup-name-input"]').fill('e2e-backup.zip');
    await backups.locator('[data-testid="backups-create-submit"]').click();
    await expect(backups.locator('[data-testid="backup-row-e2e-backup.zip"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(async () => (await app.ipcCalls('create_managed_backup')).length).toBe(1);
    expect(await runtimeFiles(page)).toContain('/mock/app-data/backups/server-1/e2e-backup.zip');
  });
});
