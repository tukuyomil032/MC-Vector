import { expect, test, type Page } from '@playwright/test';

const PREVIEW_URL = '/tests/e2e/fixtures/release-notes-preview.html';

type ReleaseNotesPreviewWindow = Window & {
  __RELEASE_NOTES_PREVIEW__?: {
    calls: string[];
    mode: string;
  };
};

async function previewCalls(page: Page) {
  return page.evaluate(
    () => (window as ReleaseNotesPreviewWindow).__RELEASE_NOTES_PREVIEW__?.calls ?? [],
  );
}

test.describe('release notes update preview', () => {
  test('renders the normal notes, filters unsupported sections, and captures a preview', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1156, height: 804 });
    await page.goto(PREVIEW_URL);

    const dialog = page.getByRole('dialog');
    const notes = page.locator('.release-notes');

    await expect(dialog.getByRole('heading', { name: 'Version 2.4.0 is available' })).toBeVisible();
    expect(
      await dialog.evaluate((element) => element.closest('.app-shell[data-theme="dark"]')),
    ).toBe(null);
    await expect(notes.getByRole('heading', { name: 'Version 2.4.0' })).toBeVisible();
    for (const section of ['Breaking changes', 'New features', 'Bug fixes', 'Performance']) {
      await expect(notes.getByRole('heading', { name: section, exact: true })).toBeVisible();
    }
    await expect(notes.getByRole('heading', { name: 'Maintenance', exact: true })).toHaveCount(0);
    await expect(notes.getByRole('heading', { name: 'Other Changes', exact: true })).toHaveCount(0);
    await expect(notes.locator('strong').filter({ hasText: 'Java 17 is now required' })).toHaveText(
      'Java 17 is now required',
    );
    await expect(notes).toContainText(
      'Kept literal <em>HTML-like</em> release note text escaped in the preview.',
    );
    await expect(notes.locator('em')).toHaveCount(0);

    const notesAppearance = await notes.evaluate((element) => {
      const styles = getComputedStyle(element);
      return { backgroundColor: styles.backgroundColor, color: styles.color };
    });
    // The notes sit on the Arc surface and text tokens, not the legacy zinc values.
    expect(notesAppearance).toEqual({
      backgroundColor: 'oklch(0.215 0 0)',
      color: 'oklch(0.96 0 0)',
    });

    const downloadAppearance = await page
      .getByTestId('update-modal-download-button')
      .evaluate((element) => {
        const styles = getComputedStyle(element);
        return { backgroundColor: styles.backgroundColor, color: styles.color };
      });
    // Arc primary in the dark theme: light fill, dark label.
    expect(downloadAppearance).toEqual({
      backgroundColor: 'oklch(0.96 0 0)',
      color: 'oklch(0.19 0 0)',
    });

    await page.screenshot({ path: testInfo.outputPath('release-notes-normal.png') });
  });

  test('keeps long notes scrollable while leaving the update controls visible', async ({
    page,
  }) => {
    await page.goto(`${PREVIEW_URL}?case=long`);

    const notes = page.locator('.release-notes');
    await expect(notes).toBeVisible();
    const metrics = await notes.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));

    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.clientHeight).toBeGreaterThan(240);
    expect(metrics.clientHeight).toBeLessThanOrEqual(450);
    expect(metrics.overflowY).toBe('auto');
    await expect(page.getByRole('button', { name: 'Later', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
  });

  test('records the cancel callback without making a network request', async ({ page }) => {
    await page.goto(PREVIEW_URL);

    await page.getByRole('button', { name: 'Later', exact: true }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => previewCalls(page)).toEqual(['dismiss']);
  });

  test('records the update callback without making a network request', async ({ page }) => {
    await page.goto(PREVIEW_URL);

    await page.getByRole('button', { name: 'Download', exact: true }).click();

    await expect.poll(() => previewCalls(page)).toEqual(['update']);
    await expect(page.getByTestId('release-notes-preview')).toHaveAttribute(
      'data-action-message',
      'update-requested',
    );
  });
});
