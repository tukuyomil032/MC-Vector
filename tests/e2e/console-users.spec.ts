import { expect, test } from './support/app-fixture';

test.describe('console and user management', () => {
  test('sends a console command, renders its log, and searches the log', async ({ page, app }) => {
    await app.gotoApp('paper-plugin-success');
    await app.openView('console');

    const commandInput = page.locator('[data-testid="console-command-input"]');
    await commandInput.fill('say hello from e2e');
    await page.locator('[data-testid="console-send-button"]').click();

    await expect(page.getByText('> say hello from e2e', { exact: true })).toBeVisible();
    await expect.poll(async () => (await app.ipcCalls('send_command')).length).toBe(1);
    expect((await app.ipcCalls('send_command'))[0].args).toMatchObject({
      command: 'say hello from e2e',
      serverId: 'server-1',
    });

    await page.locator('[data-testid="console-search-open-button"]').click();
    const searchInput = page.locator('[data-testid="console-search-input"]');
    await searchInput.fill('hello from e2e');
    await expect(page.locator('.console-view__search-count')).toContainText('1 / 1');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(searchInput).toHaveCount(0);
  });

  test('adds and removes a whitelist player through the user screen', async ({ page, app }) => {
    await app.gotoApp('paper-plugin-success');
    await app.openView('users');

    const list = page.locator('[data-testid="users-list-whitelist"]');
    await expect(list).toBeVisible();
    await list.locator('[data-testid="users-input-whitelist"]').fill('E2EPlayer');
    await list.locator('[data-testid="users-add-whitelist"]').click();

    await expect(list.getByText('E2EPlayer', { exact: true })).toBeVisible();
    await expect.poll(async () => (await app.ipcCalls('write_managed_text_file')).length).toBe(1);
    await list.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(list.getByText('E2EPlayer', { exact: true })).toHaveCount(0);
    await expect.poll(async () => (await app.ipcCalls('write_managed_text_file')).length).toBe(2);
  });
});
