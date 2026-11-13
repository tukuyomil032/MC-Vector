import { type Page, expect, test } from '@playwright/test';
import {
  BACKUP_ROOT,
  SERVER_ID,
  SERVER_ROOT,
  emitEvent,
  openApp,
  openTab,
  openView,
  recordSkipped,
  replayDragEvent,
  setCommandOverride,
  setWindowFlag,
  snap,
  snapAt,
  snapTooltip,
} from './capture-helpers';
import type { E2eScenario, E2eState } from '../e2e/support/e2e-runtime';

// One test per row of spec/idea/native-swiftui-edition/ui-reference/inventory-b.md.
// Screenshots land in screens/<ROW-ID>.png. Tooltip and toast groups use <ROW-ID>-<n>.png; the mapping
// from n to the tooltip or toast text is listed above each group. Extra variants of a state use
// <ROW-ID>-<variant>.png. Rows that cannot be captured are written to screens/_skipped-b.json.

const SEED_LOGS = [
  '[Server thread/INFO]: Starting minecraft server version 1.21.10',
  '[Server thread/INFO]: Loading properties',
  '[Server thread/WARN]: Legacy plugin VeinMiner has no checksum',
  '[Server thread/ERROR]: Could not pass event to plugin',
  '[Server thread/INFO]: Preparing spawn area: 42%',
  '[Server thread/FATAL]: Watchdog detected a stalled tick',
];

const WAIT_LONG = 60_000;
const SERVER_ROOT_DISPLAY = 'servers/server-1';

type Overrides = NonNullable<E2eState['commandOverrides']>;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A MetricHistorySnapshot with a 60 s window. The last TPS sample sets the tone. */
function metricSnapshot(tpsLast = 19.62) {
  const samples = 12;
  return {
    serverId: SERVER_ID,
    generation: 1,
    sequence: samples,
    elapsedMs: (samples - 1) * 5000,
    resource: Array.from({ length: samples }, (_, index) => ({
      elapsedMs: index * 5000,
      cpu: 12 + ((index * 7) % 11) * 2.3,
      // Memory points are bytes; the dashboard divides by 1024 * 1024 for MB.
      memory: (1400 + index * 45) * 1024 * 1024,
    })),
    tps: Array.from({ length: samples }, (_, index) => ({
      elapsedMs: index * 5000,
      tps: index === samples - 1 ? tpsLast : 19.4 + ((index * 3) % 4) * 0.2,
    })),
  };
}

/** Pushes metrics until the uptime leaves its placeholder. The listener subscribes after mount. */
async function pushMetrics(page: Page, tpsLast?: number): Promise<void> {
  const uptime = page.locator('[data-testid="dashboard-kpi-uptime-value"]');
  await expect
    .poll(async () => {
      await emitEvent(page, 'server-metrics-updated', metricSnapshot(tpsLast));
      return uptime.textContent();
    })
    .not.toBe('--:--:--');
}

async function emitLogs(page: Page, lines: string[]): Promise<void> {
  for (const line of lines) {
    await emitEvent(page, 'server-log', { serverId: SERVER_ID, line, stream: 'stdout' });
  }
}

async function openConsole(
  page: Page,
  options: { running?: boolean; seedLogs?: boolean; seed?: (state: E2eState) => void } = {},
) {
  await openTab(page, 'console', 'console-view', {
    running: options.running ?? true,
    seed: options.seed,
  });
  if (options.seedLogs) {
    await emitLogs(page, SEED_LOGS);
    // The pane renders asynchronously; wait for the rows so a click right after seeding sees them.
    await expect(page.locator('[data-level]').first()).toBeVisible();
  }
}

async function sendCommand(page: Page, command: string): Promise<void> {
  await page.locator('[data-testid="console-command-input"]').fill(command);
  await page.locator('[data-testid="console-send-button"]').click();
}

async function openConsoleSearch(page: Page): Promise<void> {
  await page.locator('[data-testid="console-search-open-button"]').click();
  await expect(page.locator('[data-testid="console-search-input"]')).toBeVisible();
}

async function consoleFilter(
  page: Page,
  label: 'All' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL',
): Promise<void> {
  await page
    .getByRole('group', { name: 'Log level filter' })
    .getByRole('button', { name: label, exact: true })
    .click();
}

const addressButton = (page: Page) =>
  page
    .locator('[data-testid="console-view"]')
    .locator('button')
    .filter({ hasText: /localhost:|example\.ngrok/ })
    .first();

/** Connects ngrok through the real flow: token dialog, save, then the tunnel reports connected. */
async function connectNgrok(page: Page): Promise<void> {
  await openView(page, 'general-settings');
  await page.locator('[data-testid="server-settings-view"]').waitFor();
  await page.locator('[data-testid="ngrok-toggle"]').click();
  const dialog = page.locator('[data-testid="ngrok-token-dialog"]');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-testid="ngrok-token-input"]').fill('e2e-token');
  await dialog.locator('[data-testid="ngrok-token-save"]').click();
  await expect(page.getByText('https://example.ngrok.test').first()).toBeVisible({
    timeout: 15_000,
  });
}

async function openFiles(page: Page, options: Parameters<typeof openTab>[3] = {}): Promise<void> {
  await openTab(page, 'files', 'files-view', { scenario: 'file-flow', ...options });
}

async function openFolderRow(page: Page, name: string): Promise<void> {
  await page.locator(`[data-testid="file-row-${name}"]`).dblclick();
}

function backupRecords(names: string[], durationMs?: number) {
  return names.map((name, index) => ({
    backupId: `e2e-backup-${index + 1}`,
    serverId: SERVER_ID,
    archivePath: name,
    kind: 'full',
    consistency: 'quiesced',
    origin: 'manual',
    createdAt: String(Date.now() - index * 60_000),
    fileCount: 1,
    totalBytes: 52_428_800,
    archiveSha256: '0'.repeat(64),
    manifestVersion: 2,
    restoreEligible: true,
    ...(durationMs === undefined ? {} : { durationMs }),
  }));
}

async function openBackups(
  page: Page,
  options: { running?: boolean; seed?: (state: E2eState) => void; overrides?: Overrides } = {},
): Promise<void> {
  await openTab(page, 'backups', 'backups-view', {
    scenario: 'backup-flow',
    running: options.running,
    seed: (state) => {
      state.backups = { [SERVER_ID]: ['e2e-backup-a.zip', 'e2e-backup-b.zip'] };
      if (options.overrides) state.commandOverrides = options.overrides;
      options.seed?.(state);
    },
  });
}

const backupRow = (page: Page, name: string) => page.locator(`[data-testid="backup-row-${name}"]`);

const catalogPath = `${BACKUP_ROOT}/.mc-vector-backup-meta.json`;

const taggedCatalog = JSON.stringify(
  {
    lastBackupName: 'e2e-backup-a.zip',
    latestSnapshot: {},
    entries: {
      'e2e-backup-a.zip': {
        tags: ['before-update', 'stable'],
        note: 'Taken before the 1.21.10 upgrade',
        createdAt: '',
      },
    },
  },
  null,
  2,
);

async function openPlugins(
  page: Page,
  options: { scenario?: E2eScenario; seed?: (state: E2eState) => void; running?: boolean } = {},
): Promise<void> {
  await openTab(page, 'plugins', 'plugin-browser', {
    scenario: options.scenario ?? 'paper-plugin-success',
    running: options.running,
    seed: options.seed,
  });
  await expect(page.locator('[data-testid="plugin-search-input"]')).toBeVisible({
    timeout: 15_000,
  });
}

const pluginResult = (page: Page, id: string) =>
  page.locator(`[data-testid="plugin-result-${id}"]`);

/**
 * The page-number field is type=number with min=1, so Chromium's constraint validation stops the submit before the
 * app's handler runs, and the "1 or higher" toast never fires. Turning validation off reaches that handler, the
 * same path a keyboard user without native validation would take.
 */
async function bypassPagerValidation(page: Page): Promise<void> {
  await page
    .locator('form')
    .filter({ has: page.locator('[data-testid="plugin-page-input"]') })
    .evaluate((form) => {
      (form as HTMLFormElement).noValidate = true;
    });
}

const VEINMINER_JAR = `${SERVER_ROOT}/plugins/VeinMiner.jar`;

async function confirmFeedbackPrimary(page: Page): Promise<void> {
  const dialog = page.locator('[data-testid="feedback-dialog"]');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByTestId('feedback-dialog-primary-action').click();
}

async function installFromCard(page: Page, id: string): Promise<void> {
  await page.locator(`[data-testid="plugin-install-${id}"]`).click();
}

async function openPropertiesFor(page: Page, options: Parameters<typeof openTab>[3] = {}) {
  await openTab(page, 'properties', 'properties-view', options);
}

const propMotd = (page: Page) => page.getByLabel('MOTD', { exact: true });

async function openGeneralSettings(page: Page, options: Parameters<typeof openTab>[3] = {}) {
  await openTab(page, 'general-settings', 'server-settings-view', options);
}

async function holdWorldDelete(page: Page, holdMs: number): Promise<void> {
  const hold = page.getByRole('button', { name: /Hold to delete/i }).first();
  // mouse.down does not scroll, and the world row can sit below the fold.
  await hold.scrollIntoViewIfNeeded();
  const box = await hold.boundingBox();
  if (!box) throw new Error('Hold button has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

test.describe('Dashboard', () => {
  const dashboard = { root: 'dashboard-view' };

  test('DASH-01', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    await snap(page, 'DASH-01');
  });

  test('DASH-01-offline', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    await expect(page.getByText('OFFLINE', { exact: true })).toBeVisible();
    await snap(page, 'DASH-01-offline');
  });

  test('DASH-01-online-no-metrics', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root, { running: true });
    await expect(page.getByText('ONLINE', { exact: true })).toBeVisible();
    await snap(page, 'DASH-01-online-no-metrics');
  });

  test('DASH-01-online-with-metrics', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root, { running: true });
    await pushMetrics(page);
    await expect(page.locator('[data-testid="dashboard-kpi-cpu-value"]')).not.toHaveText('--');
    await snap(page, 'DASH-01-online-with-metrics');
  });

  test('DASH-status-card', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    await snapAt(page, page.getByText('Status', { exact: true }), 'DASH-status-card');
  });

  test('DASH-status-variants', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    await snap(page, 'DASH-status-variants');
    for (const status of ['online', 'starting', 'stopping', 'restarting', 'crashed'] as const) {
      await emitEvent(page, 'server-status-change', {
        serverId: SERVER_ID,
        status,
        expected: true,
      });
      await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', status);
      await snap(page, `DASH-status-variants-${status}`);
    }
  });

  test('DASH-uptime', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root, { running: true });
    await expect(page.locator('[data-testid="dashboard-kpi-uptime-value"]')).toHaveText('--:--:--');
    await snap(page, 'DASH-uptime-placeholder');
    await pushMetrics(page);
    await snap(page, 'DASH-uptime');
  });

  test('DASH-server-card', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    await expect(page.locator('[data-testid="dashboard-software"]')).toBeVisible();
    await snapAt(page, page.locator('[data-testid="dashboard-software"]'), 'DASH-server-card');
  });

  test('DASH-address-copy', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    const copy = page.getByRole('button', { name: 'Copy address', exact: true });
    await snapAt(page, copy, 'DASH-address-copy');
    await copy.click();
    await page.waitForTimeout(300);
    await snap(page, 'DASH-address-copy-copied');
  });

  test('DASH-javaruntime-default', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    await expect(
      page.getByText('System Default (PATH environment)', { exact: true }),
    ).toBeVisible();
    await snap(page, 'DASH-javaruntime-default');
    await openApp(page, {
      seed: (state) => {
        const server = state.servers[0];
        state.servers = [
          {
            ...server,
            javaPath: '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java',
          },
        ];
      },
    });
    await openView(page, 'dashboard');
    await expect(page.locator('[data-testid="dashboard-view"]')).toBeVisible();
    await snap(page, 'DASH-javaruntime-default-custom');
  });

  test('DASH-kpi-cpu', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    await snapAt(page, page.getByRole('region', { name: 'Key metrics' }), 'DASH-kpi-cpu');
    await openTab(page, 'dashboard', dashboard.root, { running: true });
    await pushMetrics(page);
    await snapAt(page, page.getByRole('region', { name: 'Key metrics' }), 'DASH-kpi-cpu-value');
  });

  test('DASH-kpi-memory', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    await snapAt(page, page.getByRole('region', { name: 'Key metrics' }), 'DASH-kpi-memory');
    await openTab(page, 'dashboard', dashboard.root, { running: true });
    await pushMetrics(page);
    await expect(page.getByText('MB', { exact: false }).first()).toBeVisible();
    await snapAt(page, page.getByRole('region', { name: 'Key metrics' }), 'DASH-kpi-memory-value');
  });

  test('DASH-kpi-tps', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    await snapAt(page, page.getByRole('region', { name: 'Key metrics' }), 'DASH-kpi-tps');
    await openTab(page, 'dashboard', dashboard.root, { running: true });
    await pushMetrics(page);
    await snapAt(page, page.getByRole('region', { name: 'Key metrics' }), 'DASH-kpi-tps-value');
  });

  test('DASH-tps-tone', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    await snapAt(page, page.getByRole('region', { name: 'Key metrics' }), 'DASH-tps-tone-none');
    for (const [name, tps] of [
      ['good', 19.62],
      ['fair', 16.5],
      ['poor', 12.3],
    ] as const) {
      await openTab(page, 'dashboard', dashboard.root, { running: true });
      await pushMetrics(page, tps);
      await expect(
        page.locator('[data-testid="dashboard-view"] [data-tone]').first(),
      ).toHaveAttribute('data-tone', name);
      await snapAt(
        page,
        page.getByRole('region', { name: 'Key metrics' }),
        name === 'good' ? 'DASH-tps-tone' : `DASH-tps-tone-${name}`,
      );
    }
  });

  test('DASH-chart-cpu', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root, { running: true });
    await pushMetrics(page);
    await snapAt(
      page,
      page.getByText('CPU Usage (%) - Last 60s', { exact: true }),
      'DASH-chart-cpu',
    );
  });

  test('DASH-chart-memory', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root, { running: true });
    await pushMetrics(page);
    await snapAt(
      page,
      page.getByText('Memory Usage (MB) - Last 60s', { exact: true }),
      'DASH-chart-memory',
    );
  });

  test('DASH-chart-tps', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root, { running: true });
    await pushMetrics(page);
    await snapAt(page, page.getByText('TPS - Last 60s', { exact: true }), 'DASH-chart-tps');
  });

  test('DASH-chart-empty', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    await expect(page.getByText('Waiting for measurement').first()).toBeVisible();
    await snapAt(page, page.getByText('Waiting for TPS', { exact: true }), 'DASH-chart-empty');
  });

  test('DASH-chart-held-point', async ({ page }) => {
    // A display-only point holds the latest value up to "now". It is the last datum of the chart, so the
    // pointer at the plot's right edge explores it and shows the "Held since" tooltip.
    await openTab(page, 'dashboard', dashboard.root, { running: true });
    await pushMetrics(page);
    await page.waitForTimeout(1500);
    const plot = page.getByRole('slider', { name: /CPU/ }).first();
    await plot.scrollIntoViewIfNeeded();
    const box = await plot.boundingBox();
    if (!box) throw new Error('CPU chart plot has no box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 4 });
    const held = page.getByText(/Held since/).first();
    const visible = await held.waitFor({ state: 'visible', timeout: 4_000 }).then(
      () => true,
      () => false,
    );
    if (!visible) {
      recordSkipped(
        'DASH-chart-held-point',
        'The held tooltip did not appear when the pointer was moved to the right edge of the CPU plot in the E2E runtime. The display-only point only exists while "now" is past the last measured sample, and the mock metrics clock does not advance that way.',
      );
      return;
    }
    await snap(page, 'DASH-chart-held-point');
  });

  test('DASH-notify-highcpu', async () => {
    recordSkipped(
      'DASH-notify-highcpu',
      'Native OS notification (sendServerNotification via tauri-plugin-notification). It is drawn by macOS Notification Center outside the WebView. The E2E notification mock is a no-op with no call record, so neither a pixel nor a call can be captured.',
    );
  });

  test('DASH-tooltips', async ({ page }) => {
    await openTab(page, 'dashboard', dashboard.root);
    const copy = page.getByRole('button', { name: 'Copy address', exact: true });
    await copy.hover();
    await page.waitForTimeout(600);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await snap(page, 'DASH-tooltips');
  });
});

// ---------------------------------------------------------------------------
// Console
// ---------------------------------------------------------------------------

test.describe('Console', () => {
  test('CONSOLE-01', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await snap(page, 'CONSOLE-01');
  });

  test('CONSOLE-toolbar-address', async ({ page }) => {
    await openConsole(page);
    await snapTooltip(page, addressButton(page), /click to copy/i, 'CONSOLE-toolbar-address');
  });

  test('CONSOLE-address-copied', async ({ page }) => {
    await openConsole(page);
    await addressButton(page).click();
    await expect(page.getByText('Copied', { exact: true })).toBeVisible();
    await snap(page, 'CONSOLE-address-copied');
    await openConsole(page);
    await setWindowFlag(page, '__clipboardFail', true);
    await addressButton(page).click();
    await expect(page.getByText('Could not copy the address', { exact: false })).toBeVisible();
    await snap(page, 'CONSOLE-address-copied-failed');
  });

  test('CONSOLE-address-ngrok', async ({ page }) => {
    await openApp(page, { running: true });
    await connectNgrok(page);
    await openView(page, 'console');
    await expect(addressButton(page)).toContainText('example.ngrok.test', { timeout: 8_000 });
    await snap(page, 'CONSOLE-address-ngrok');
    await expect(addressButton(page)).toContainText('localhost:25565', { timeout: 8_000 });
    await snap(page, 'CONSOLE-address-ngrok-local');
  });

  test('CONSOLE-toolbar-status', async ({ page }) => {
    await openConsole(page, { running: false });
    await expect(page.locator('[data-testid="console-status"]')).toContainText('Stopped');
    await snap(page, 'CONSOLE-toolbar-status');
    await openConsole(page, { running: true });
    await expect(page.locator('[data-testid="console-status"]')).toContainText('Running');
    await snap(page, 'CONSOLE-toolbar-status-running');
    for (const [status, label] of [
      ['starting', 'Starting'],
      ['stopping', 'Stopping'],
      ['restarting', 'Restarting'],
      ['crashed', 'Crashed'],
    ] as const) {
      await emitEvent(page, 'server-status-change', {
        serverId: SERVER_ID,
        status,
        expected: true,
      });
      await expect(page.locator('[data-testid="console-status"]')).toContainText(label);
      await snap(page, `CONSOLE-toolbar-status-${status}`);
    }
  });

  test('CONSOLE-toolbar-memory', async ({ page }) => {
    await openConsole(page, { running: false });
    await expect(page.getByText('MEMORY', { exact: true })).toBeVisible();
    await snap(page, 'CONSOLE-toolbar-memory');
    // The memory label formats numbers with grouping ("2,048"). server-stats memory is in bytes.
    await openConsole(page, { running: true });
    await expect(
      page
        .locator('[data-testid="console-view"]')
        .getByText(/^0 \/ 2,?048 MB$/)
        .first(),
    ).toBeVisible();
    await snap(page, 'CONSOLE-toolbar-memory-online');
    await emitEvent(page, 'server-stats', { serverId: SERVER_ID, memory: 1536 * 1024 * 1024 });
    await expect(
      page
        .locator('[data-testid="console-view"]')
        .getByText(/^1,?536 \/ 2,?048 MB$/)
        .first(),
    ).toBeVisible();
    await snap(page, 'CONSOLE-toolbar-memory-online-stats');
  });

  test('CONSOLE-find-button', async ({ page }) => {
    await openConsole(page);
    await snapTooltip(
      page,
      page.locator('[data-testid="console-search-open-button"]'),
      'Find',
      'CONSOLE-find-button',
    );
  });

  test('CONSOLE-search-open', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await openConsoleSearch(page);
    await expect(page.locator('[data-testid="console-search-input"]')).toBeFocused();
    await snap(page, 'CONSOLE-search-open');
  });

  test('CONSOLE-search-count', async ({ page }) => {
    await openConsole(page);
    await sendCommand(page, 'say hello');
    await expect(page.getByText('> say hello', { exact: true })).toBeVisible();
    await openConsoleSearch(page);
    await page.locator('[data-testid="console-search-input"]').fill('hello');
    await expect(page.locator('[data-testid="console-search-count"]')).toHaveText('1 / 1');
    await snap(page, 'CONSOLE-search-count');
    await page.locator('[data-testid="console-search-input"]').fill('zzz');
    await expect(page.locator('[data-testid="console-search-count"]')).toHaveText('0 / 0');
    await snap(page, 'CONSOLE-search-count-zero');
    await sendCommand(page, 'say hello again');
    await page.locator('[data-testid="console-search-input"]').fill('hello');
    await expect(page.locator('[data-testid="console-search-count"]')).toHaveText('1 / 2');
    await snap(page, 'CONSOLE-search-count-two');
  });

  test('CONSOLE-search-regex', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await openConsoleSearch(page);
    const regex = page.getByRole('button', { name: 'Regex', exact: true });
    await expect(regex).toHaveAttribute('aria-pressed', 'false');
    await snap(page, 'CONSOLE-search-regex-off');
    await regex.click();
    await expect(regex).toHaveAttribute('aria-pressed', 'true');
    await snap(page, 'CONSOLE-search-regex');
  });

  test('CONSOLE-search-invalid', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await openConsoleSearch(page);
    await page.getByRole('button', { name: 'Regex', exact: true }).click();
    await page.locator('[data-testid="console-search-input"]').fill('(');
    await expect(page.getByText('Invalid regular expression', { exact: true })).toBeVisible();
    await snap(page, 'CONSOLE-search-invalid');
  });

  test('CONSOLE-search-nav', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await openConsoleSearch(page);
    const input = page.locator('[data-testid="console-search-input"]');
    await input.fill('server');
    await expect(page.locator('[data-testid="console-search-count"]')).toHaveText(/^1 \/ \d+$/);
    await page.getByRole('button', { name: 'Next match', exact: true }).click();
    await expect(page.locator('[data-testid="console-search-count"]')).toHaveText(/^2 \/ \d+$/);
    await snap(page, 'CONSOLE-search-nav');
    await input.fill('zzz');
    await expect(page.getByRole('button', { name: 'Next match', exact: true })).toBeDisabled();
    await snap(page, 'CONSOLE-search-nav-disabled');
  });

  test('CONSOLE-search-close', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await openConsoleSearch(page);
    await page.locator('[data-testid="console-search-input"]').fill('server');
    await snap(page, 'CONSOLE-search-close');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('[data-testid="console-search-input"]')).toHaveCount(0);
    await snap(page, 'CONSOLE-search-close-after');
  });

  test('CONSOLE-search-highlight', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await openConsoleSearch(page);
    await page.locator('[data-testid="console-search-input"]').fill('SERVER');
    await expect(page.locator('[data-testid="console-view"] mark').first()).toBeVisible();
    await snap(page, 'CONSOLE-search-highlight');
  });

  test('CONSOLE-filter', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await consoleFilter(page, 'All');
    await snap(page, 'CONSOLE-filter-all');
    await consoleFilter(page, 'INFO');
    await snap(page, 'CONSOLE-filter-info');
    await consoleFilter(page, 'WARN');
    await expect(page.getByText('Legacy plugin VeinMiner', { exact: false }).first()).toBeVisible();
    await snap(page, 'CONSOLE-filter');
    await consoleFilter(page, 'ERROR');
    await snap(page, 'CONSOLE-filter-error');
    await consoleFilter(page, 'FATAL');
    await snap(page, 'CONSOLE-filter-fatal');
  });

  test('CONSOLE-empty-waiting', async ({ page }) => {
    await openConsole(page);
    await expect(page.getByText('Waiting for logs...', { exact: true })).toBeVisible();
    await snap(page, 'CONSOLE-empty-waiting');
  });

  test('CONSOLE-empty-level', async ({ page }) => {
    await openConsole(page);
    await sendCommand(page, 'say ok');
    await expect(page.getByText('> say ok', { exact: true })).toBeVisible();
    await consoleFilter(page, 'ERROR');
    await expect(page.getByText('ERROR logs not found.', { exact: true })).toBeVisible();
    await snap(page, 'CONSOLE-empty-level');
  });

  test('CONSOLE-save-logs', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await page.locator('[data-testid="console-save-button"]').click();
    await expect(page.getByText('Failed to save logs', { exact: true })).toBeVisible();
    await snap(page, 'CONSOLE-save-logs');

    // The success path ("Logs saved") is not reachable: tauriInvoke rejects export_text_file with
    // "Blocked tauri command" before the IPC layer, so the save always takes the error path.
    // No visible lines at all: the save reports that there is nothing to save.
    await openConsole(page);
    await page.locator('[data-testid="console-save-button"]').click();
    await expect(page.getByText('No logs to save', { exact: true })).toBeVisible();
    await snap(page, 'CONSOLE-save-logs-empty');
  });

  test('CONSOLE-pin-line', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    const pin = page.getByRole('button', { name: 'Pin this line', exact: true }).first();
    await snapTooltip(page, pin, 'Pin this line', 'CONSOLE-pin-line');
    await pin.click();
    await expect(page.getByRole('button', { name: 'Unpin', exact: true }).first()).toBeVisible();
    await snap(page, 'CONSOLE-pin-line-pinned');
  });

  test('CONSOLE-pin-limit', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    for (let index = 0; index < 5; index += 1) {
      await page.getByRole('button', { name: 'Pin this line', exact: true }).first().click();
    }
    await expect(page.getByText('Pinned logs', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pin this line', exact: true }).first().click();
    await expect(
      page.getByText('You can pin up to 5 lines', { exact: true }).first(),
    ).toBeVisible();
    await snap(page, 'CONSOLE-pin-limit');
  });

  test('CONSOLE-pinned-area', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await page.getByRole('button', { name: 'Pin this line', exact: true }).first().click();
    await expect(page.getByText('Pinned logs', { exact: true })).toBeVisible();
    await snap(page, 'CONSOLE-pinned-area');
    await page.getByRole('button', { name: 'Unpin', exact: true }).first().click();
    await expect(page.getByText('Pinned logs', { exact: true })).toHaveCount(0);
    await snap(page, 'CONSOLE-pinned-area-hidden');
  });

  test('CONSOLE-log-pane', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await expect(page.locator('[data-level]').first()).toBeVisible();
    await snap(page, 'CONSOLE-log-pane');
  });

  test('CONSOLE-log-severity', async ({ page }) => {
    await openConsole(page);
    await emitLogs(page, [
      '[Server thread/FATAL]: FATAL x',
      '[Server thread/ERROR]: ERROR x',
      '[Server thread/WARN]: WARN x',
      '[Server thread/INFO]: info x',
    ]);
    await expect(page.locator('[data-level="fatal"]').first()).toBeVisible();
    await snap(page, 'CONSOLE-log-severity');
  });

  test('CONSOLE-jump-latest', async ({ page }) => {
    await openConsole(page);
    const lines = Array.from(
      { length: 40 },
      (_, index) => `[Server thread/INFO]: line ${index + 1}`,
    );
    await emitLogs(page, lines);
    await expect(page.locator('[data-level]').nth(39)).toBeAttached();
    await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('[data-level]');
      let pane: HTMLElement | null = row?.parentElement ?? null;
      while (pane && pane.scrollHeight <= pane.clientHeight) pane = pane.parentElement;
      if (pane) {
        pane.scrollTop = 0;
        pane.dispatchEvent(new Event('scroll'));
      }
    });
    await expect(page.getByRole('button', { name: 'Jump to latest', exact: false })).toBeVisible();
    await snap(page, 'CONSOLE-jump-latest');
  });

  test('CONSOLE-command-input', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await page.locator('[data-testid="console-command-input"]').fill('say hello');
    await snap(page, 'CONSOLE-command-input');
  });

  test('CONSOLE-command-offline', async ({ page }) => {
    await openConsole(page, { running: false });
    await expect(page.locator('[data-testid="console-command-input"]')).toBeDisabled();
    const sendWrapper = page.locator('[data-testid="console-send-button"]').locator('xpath=..');
    await snapTooltip(
      page,
      sendWrapper,
      'Start the server to send commands.',
      'CONSOLE-command-offline',
    );
  });

  test('CONSOLE-send-button', async ({ page }) => {
    await openConsole(page, { seedLogs: true });
    await page.locator('[data-testid="console-command-input"]').fill('say hello');
    await snap(page, 'CONSOLE-send-button');
    await page.locator('[data-testid="console-send-button"]').click();
    await expect(page.getByText('> say hello', { exact: true })).toBeVisible();
    await snap(page, 'CONSOLE-send-button-sent');
  });

  test('CONSOLE-history-recall', async ({ page }) => {
    await openConsole(page);
    await sendCommand(page, 'say one');
    await sendCommand(page, 'say two');
    const input = page.locator('[data-testid="console-command-input"]');
    await input.press('ArrowUp');
    await input.press('ArrowUp');
    await expect(input).toHaveValue('say one');
    await snap(page, 'CONSOLE-history-recall');
  });

  test('CONSOLE-shortcut-find', async ({ page }) => {
    await openConsole(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Meta+f');
    await expect(page.locator('[data-testid="console-search-input"]')).toBeFocused();
    await snap(page, 'CONSOLE-shortcut-find');
  });

  test('CONSOLE-toasts', async ({ page }) => {
    // 1: pin limit (info)
    await openConsole(page, { seedLogs: true });
    for (let index = 0; index < 6; index += 1) {
      await page.getByRole('button', { name: 'Pin this line', exact: true }).first().click();
    }
    await expect(
      page.getByText('You can pin up to 5 lines', { exact: true }).first(),
    ).toBeVisible();
    await snap(page, 'CONSOLE-toasts-1');

    // 2: copy failed (error)
    await openConsole(page);
    await setWindowFlag(page, '__clipboardFail', true);
    await addressButton(page).click();
    await expect(page.getByText('Could not copy the address', { exact: false })).toBeVisible();
    await snap(page, 'CONSOLE-toasts-2');

    // 3: no logs to save (info)
    await openConsole(page);
    await page.locator('[data-testid="console-save-button"]').click();
    await expect(page.getByText('No logs to save', { exact: true })).toBeVisible();
    await snap(page, 'CONSOLE-toasts-3');

    // 4: logs saved (success) is not reachable. src/lib/tauri-api.ts rejects export_text_file with
    // "Blocked tauri command" because the command is missing from src/lib/tauri-command-allowlist.ts,
    // so every save takes the error path. Captured as skipped.
    recordSkipped(
      'CONSOLE-toasts-4',
      'Success toast "Logs saved". Unreachable in every build: export_text_file is registered in src-tauri/src/lib.rs but missing from src/lib/tauri-command-allowlist.ts, so tauriInvoke throws "Blocked tauri command: export_text_file" before the IPC call. The mock cannot answer it.',
    );

    // 5: failed to save logs (error)
    await openConsole(page, { seedLogs: true });
    await page.locator('[data-testid="console-save-button"]').click();
    await expect(page.getByText('Failed to save logs', { exact: true }).first()).toBeVisible();
    await snap(page, 'CONSOLE-toasts-5');
  });
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

test.describe('Files', () => {
  test('FILES-01', async ({ page }) => {
    await openFiles(page);
    await snap(page, 'FILES-01');
  });

  test('FILES-toolbar-up', async ({ page }) => {
    await openFiles(page);
    await expect(page.getByRole('button', { name: 'Go Up', exact: true })).toBeDisabled();
    await snap(page, 'FILES-toolbar-up');
    await openFolderRow(page, 'world');
    await expect(page.getByRole('button', { name: 'Go Up', exact: true })).toBeEnabled();
    await snap(page, 'FILES-toolbar-up-enabled');
  });

  test('FILES-breadcrumb', async ({ page }) => {
    await openFiles(page);
    await expect(page.locator('[aria-label="Path"]').first()).toBeVisible();
    await snap(page, 'FILES-breadcrumb');
    await openFolderRow(page, 'world');
    await expect(page.locator('[aria-current="page"]', { hasText: 'world' })).toBeVisible();
    await snap(page, 'FILES-breadcrumb-nested');
  });

  test('FILES-breadcrumb-outside', async ({ page }) => {
    await openFiles(page);
    recordSkipped(
      'FILES-breadcrumb-outside',
      'The raw-path branch runs only when the resolved folder is outside the managed servers root. The mock resolves every managed path under /mock/app-data/servers and the UI only navigates inside the selected server, so no E2E path reaches it without changing the component.',
    );
  });

  test('FILES-toolbar-tools', async ({ page }) => {
    await openFiles(page);
    await expect(page.getByRole('button', { name: 'Create / Import', exact: true })).toBeVisible();
    await snap(page, 'FILES-toolbar-tools');
  });

  test('FILES-toolbar-selection', async ({ page }) => {
    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await expect(page.getByRole('group', { name: 'Selected items' })).toBeVisible();
    await snap(page, 'FILES-toolbar-selection');
  });

  test('FILES-row', async ({ page }) => {
    await openFiles(page);
    await expect(page.locator('[data-testid="file-row-world"]')).toBeVisible();
    await snap(page, 'FILES-row');
  });

  test('FILES-row-selected', async ({ page }) => {
    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await expect(page.locator('[data-testid="file-row-server.properties"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await snap(page, 'FILES-row-selected');
  });

  test('FILES-row-multi', async ({ page }) => {
    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page
      .locator('[data-testid="file-row-whitelist.json"]')
      .click({ modifiers: ['ControlOrMeta'] });
    await expect(page.locator('[data-testid="file-row-whitelist.json"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await snap(page, 'FILES-row-multi');
  });

  test('FILES-row-folder-size', async ({ page }) => {
    await openFiles(page);
    await expect(page.locator('[data-testid="file-row-plugins"]')).toContainText('50 MB');
    await snap(page, 'FILES-row-folder-size');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { get_managed_directory_size: { delayMs: WAIT_LONG } };
      },
    });
    await expect(page.locator('[data-testid="file-row-plugins"]')).toContainText('…');
    await snap(page, 'FILES-row-folder-size-measuring');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { get_managed_directory_size: { error: 'E2E size walk failed' } };
      },
    });
    await expect(page.locator('[data-testid="file-row-plugins"]')).toContainText('—');
    await snap(page, 'FILES-row-folder-size-failed');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = {
          get_managed_directory_size: { response: { bytes: 52_428_800, complete: false } },
        };
      },
    });
    await expect(page.locator('[data-testid="file-row-plugins"]')).toContainText('+');
    await snap(page, 'FILES-row-folder-size-partial');
  });

  test('FILES-row-dnd', async ({ page }) => {
    await openFiles(page);
    await page
      .locator('[data-testid="file-row-server.properties"]')
      .dragTo(page.locator('[data-testid="file-row-world"]'));
    await expect(page.locator('[data-testid="file-row-server.properties"]')).toHaveCount(0);
    await snap(page, 'FILES-row-dnd');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { move_managed_path: { error: 'E2E move failed' } };
      },
    });
    await page
      .locator('[data-testid="file-row-server.properties"]')
      .dragTo(page.locator('[data-testid="file-row-world"]'));
    await expect(page.getByText('Failed to move', { exact: true })).toBeVisible();
    await snap(page, 'FILES-row-dnd-failed');
  });

  test('FILES-ctx-file', async ({ page }) => {
    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
    await snap(page, 'FILES-ctx-file');
  });

  test('FILES-ctx-folder', async ({ page }) => {
    await openFiles(page);
    await page.locator('[data-testid="file-row-world"]').click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
    await snap(page, 'FILES-ctx-folder');
  });

  test('FILES-ctx-multi', async ({ page }) => {
    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page
      .locator('[data-testid="file-row-whitelist.json"]')
      .click({ modifiers: ['ControlOrMeta'] });
    await page.locator('[data-testid="file-row-server.properties"]').click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
    await snap(page, 'FILES-ctx-multi');
  });

  test('FILES-ctx-empty', async ({ page }) => {
    await openFiles(page);
    const last = page.locator('[data-testid^="file-row-"]').last();
    const box = await last.boundingBox();
    if (!box) throw new Error('No file row to measure');
    await page.mouse.click(box.x + 60, box.y + box.height + 60, { button: 'right' });
    await expect(page.getByRole('menu', { name: 'Folder actions' })).toBeVisible();
    await snap(page, 'FILES-ctx-empty');
  });

  test('FILES-empty-folder', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'backups');
    await expect(page.getByText('Folder is empty', { exact: true })).toBeVisible();
    await snap(page, 'FILES-empty-folder');
  });

  test('FILES-drop-overlay', async ({ page }) => {
    await openFiles(page);
    await replayDragEvent(page, { type: 'enter', paths: [], position: { x: 300, y: 300 } });
    await expect(
      page.getByText('Drop here to upload into the current folder', { exact: true }),
    ).toBeVisible();
    await snap(page, 'FILES-drop-overlay');
    await replayDragEvent(page, { type: 'leave' });
  });

  test('FILES-dialog-create', async ({ page }) => {
    await openFiles(page);
    await page.getByRole('button', { name: 'Create / Import', exact: true }).click();
    await expect(page.locator('[data-testid="files-create-modal"]')).toBeVisible();
    await snap(page, 'FILES-dialog-create');
    await page.locator('[data-testid="files-create-file-option"]').click();
    await snap(page, 'FILES-dialog-create-file');
    await page.locator('[data-testid="files-import-button"]').click();
    await snap(page, 'FILES-dialog-create-import');
  });

  test('FILES-dialog-create-invalid', async ({ page }) => {
    await openFiles(page);
    await page.getByRole('button', { name: 'Create / Import', exact: true }).click();
    await page.locator('[data-testid="files-create-file-option"]').click();
    await page.locator('[data-testid="files-name-input"]').fill('a/b');
    await expect(
      page.getByText('Names cannot contain / or \\', { exact: false }).first(),
    ).toBeVisible();
    await snap(page, 'FILES-dialog-create-invalid');
  });

  test('FILES-dialog-move', async ({ page }) => {
    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await expect(page.locator('[data-testid="files-move-modal"]')).toBeVisible();
    await snap(page, 'FILES-dialog-move');
  });

  test('FILES-dialog-move-directory', async ({ page }) => {
    await openFiles(page);
    const last = page.locator('[data-testid^="file-row-"]').last();
    const box = await last.boundingBox();
    if (!box) throw new Error('No file row to measure');
    await page.mouse.click(box.x + 60, box.y + box.height + 60, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Move', exact: true }).click();
    await expect(page.locator('[data-testid="files-move-modal"]')).toBeVisible();
    await snap(page, 'FILES-dialog-move-directory');
  });

  test('FILES-dialog-move-into-self', async ({ page }) => {
    await openFiles(page);
    await page.locator('[data-testid="file-row-world"]').click();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    const input = page.locator('[data-testid="files-move-input"]');
    const current = await input.inputValue();
    await input.fill(`${current}/world`);
    await expect(
      page.getByText('Items cannot be moved into themselves.', { exact: true }).first(),
    ).toBeVisible();
    await snap(page, 'FILES-dialog-move-into-self');
  });

  test('FILES-dialog-rename', async ({ page }) => {
    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await expect(page.locator('[data-testid="files-rename-modal"]')).toBeVisible();
    await snap(page, 'FILES-dialog-rename');
  });

  test('FILES-dialog-rename-invalid', async ({ page }) => {
    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await page.locator('[data-testid="files-rename-input"]').fill('a/b');
    await expect(
      page.getByText('Names cannot contain / or \\', { exact: false }).first(),
    ).toBeVisible();
    await snap(page, 'FILES-dialog-rename-invalid');
  });

  test('FILES-confirm-delete', async ({ page }) => {
    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('[data-testid="feedback-confirm-confirm"]')).toBeVisible();
    await snap(page, 'FILES-confirm-delete');
  });

  test('FILES-loading-file', async ({ page }) => {
    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { read_managed_text_file: { delayMs: WAIT_LONG } };
      },
    });
    await openFolderRow(page, 'server.properties');
    await expect(page.getByText('Loading...', { exact: true }).first()).toBeVisible();
    await snap(page, 'FILES-loading-file');
  });

  test('FILES-toasts', async ({ page }) => {
    // 1 Created, 2 Imported, 3 Moved, 4 Renamed, 5 Compressed, 6 Extracted, 7 Deleted, 8 Uploaded n file(s),
    // 9 Failed to upload dropped files, 10 Failed to load file list, 11 Failed to read file,
    // 12 Failed to save, 13 Failed to delete, 14 Failed to create, 15 Failed to move, 16 Failed to rename,
    // 17 Failed to compress, 18 Failed to extract, 19 Skipped n item(s) that are not .zip archives.,
    // 20 Select a .zip archive to extract.
    const zipSeed = (state: E2eState) => {
      state.files[`${SERVER_ROOT}/archive.zip`] = {
        kind: 'file',
        content: 'zip',
        modified: Date.now(),
      };
    };

    await openFiles(page);
    await page.getByRole('button', { name: 'Create / Import', exact: true }).click();
    await page.locator('[data-testid="files-create-file-option"]').click();
    await page.locator('[data-testid="files-name-input"]').fill('e2e-created.txt');
    await page.locator('[data-testid="files-create-submit"]').click();
    await expect(page.getByText('Created', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-1');

    await openFiles(page);
    await page.getByRole('button', { name: 'Create / Import', exact: true }).click();
    await page.locator('[data-testid="files-import-button"]').click();
    await page.locator('[data-testid="files-create-submit"]').click();
    await expect(page.getByText('Imported', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-2');

    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await page.locator('[data-testid="files-move-input"]').fill(`${SERVER_ROOT_DISPLAY}/backups`);
    await page.locator('[data-testid="files-move-submit"]').click();
    await expect(page.getByText('Moved', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-3');

    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await page.locator('[data-testid="files-rename-input"]').fill('server-renamed.properties');
    await page.locator('[data-testid="files-rename-submit"]').click();
    await expect(page.getByText('Renamed', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-4');

    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page.getByRole('button', { name: 'Compress', exact: true }).click();
    await expect(page.getByText('Compressed', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-5');

    await openFiles(page, { seed: zipSeed });
    await page.locator('[data-testid="file-row-archive.zip"]').click();
    await page.getByRole('button', { name: 'Extract', exact: true }).click();
    await expect(page.getByText('Extracted', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-6');

    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(page.getByText('Deleted', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-7');

    await openFiles(page);
    await replayDragEvent(page, {
      type: 'drop',
      paths: ['/mock/external/upload.jar'],
      position: { x: 300, y: 300 },
    });
    await expect(page.getByText('Uploaded 1 file(s)', { exact: false })).toBeVisible();
    await snap(page, 'FILES-toasts-8');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { import_managed_files: { error: 'E2E upload failed' } };
      },
    });
    await replayDragEvent(page, {
      type: 'drop',
      paths: ['/mock/external/upload.jar'],
      position: { x: 300, y: 300 },
    });
    await expect(page.getByText('Failed to upload dropped files', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-9');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { list_dir_with_metadata: { error: 'E2E list failed' } };
      },
    });
    await expect(page.getByText('Failed to load file list', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-10');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { read_managed_text_file: { error: 'E2E read failed' } };
      },
    });
    await openFolderRow(page, 'server.properties');
    await expect(page.getByText('Failed to read file', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-11');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { write_managed_text_file: { error: 'E2E write failed' } };
      },
    });
    await openFolderRow(page, 'server.properties');
    await page
      .getByRole('region', { name: 'server.properties' })
      .locator('.monaco-editor .view-lines')
      .click();
    await page.keyboard.type('# e2e');
    await page.keyboard.press('Meta+s');
    await expect(page.getByText('Failed to save', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-12');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { delete_managed_path: { error: 'E2E delete failed' } };
      },
    });
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(page.getByText('Failed to delete', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-13');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { write_managed_text_file: { error: 'E2E create failed' } };
      },
    });
    await page.getByRole('button', { name: 'Create / Import', exact: true }).click();
    await page.locator('[data-testid="files-create-file-option"]').click();
    await page.locator('[data-testid="files-name-input"]').fill('e2e-broken.txt');
    await page.locator('[data-testid="files-create-submit"]').click();
    await expect(page.getByText('Failed to create', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-14');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { move_managed_path: { error: 'E2E move failed' } };
      },
    });
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await page.locator('[data-testid="files-move-input"]').fill(`${SERVER_ROOT_DISPLAY}/backups`);
    await page.locator('[data-testid="files-move-submit"]').click();
    await expect(page.getByText('Failed to move', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-15');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { move_managed_path: { error: 'E2E rename failed' } };
      },
    });
    await page.locator('[data-testid="file-row-server.properties"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await page.locator('[data-testid="files-rename-input"]').fill('server-renamed.properties');
    await page.locator('[data-testid="files-rename-submit"]').click();
    await expect(page.getByText('Failed to rename', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-16');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { compress_managed_items: { error: 'E2E compress failed' } };
      },
    });
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page.getByRole('button', { name: 'Compress', exact: true }).click();
    await expect(page.getByText('Failed to compress', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-17');

    await openFiles(page, {
      seed: (state) => {
        zipSeed(state);
        state.commandOverrides = { extract_managed_item: { error: 'E2E extract failed' } };
      },
    });
    await page.locator('[data-testid="file-row-archive.zip"]').click();
    await page.getByRole('button', { name: 'Extract', exact: true }).click();
    await expect(page.getByText('Failed to extract', { exact: true })).toBeVisible();
    await snap(page, 'FILES-toasts-18');

    await openFiles(page, { seed: zipSeed });
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page
      .locator('[data-testid="file-row-archive.zip"]')
      .click({ modifiers: ['ControlOrMeta'] });
    await page.getByRole('button', { name: 'Extract', exact: true }).click();
    await expect(
      page.getByText('Skipped 1 item(s) that are not .zip archives.', { exact: false }),
    ).toBeVisible();
    await snap(page, 'FILES-toasts-19');

    await openFiles(page);
    await page.locator('[data-testid="file-row-server.properties"]').click();
    await page.getByRole('button', { name: 'Extract', exact: true }).click();
    await expect(
      page.getByText('Select a .zip archive to extract.', { exact: true }),
    ).toBeVisible();
    await snap(page, 'FILES-toasts-20');
  });

  test('FILES-tooltips', async ({ page }) => {
    await openFiles(page);
    await expect(page.getByRole('button', { name: 'Go Up', exact: true })).toHaveAttribute(
      'title',
      'Go Up',
    );
    recordSkipped(
      'FILES-tooltips',
      'Files toolbar tooltips are native title attributes (Go Up, Create / Import, Open in Explorer, and the selection buttons). The OS draws them outside the page, so Playwright page screenshots cannot show them. The titles are asserted through the accessible names in the other captures.',
    );
  });

  test('FILES-editor-workspace', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    await expect(page.getByRole('region', { name: 'server.properties' })).toBeVisible({
      timeout: 15_000,
    });
    await snap(page, 'FILES-editor-workspace');
  });

  test('FILES-editor-back-button', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    await expect(page.getByRole('region', { name: 'server.properties' })).toBeVisible({
      timeout: 15_000,
    });
    await snapTooltip(
      page,
      page.getByRole('button', { name: 'Close editor', exact: true }),
      'Close editor',
      'FILES-editor-back-button',
    );
  });

  test('FILES-editor-unsaved-dot', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await editor.locator('.monaco-editor .view-lines').click();
    await page.keyboard.type('# e2e');
    // The dot is an svg next to the file name; the sr-only "Unsaved" text sits underneath it and is not hoverable.
    await snapTooltip(
      page,
      editor.locator('svg.lucide-circle').first(),
      'Unsaved',
      'FILES-editor-unsaved-dot',
    );
  });

  test('FILES-editor-shortcut', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await snapTooltip(page, editor.locator('kbd').first(), /Save \(/, 'FILES-editor-shortcut');
  });

  test('FILES-editor-save-button', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor).toBeVisible({ timeout: 15_000 });
    const save = editor.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await snap(page, 'FILES-editor-save-button');
    await editor.locator('.monaco-editor .view-lines').click();
    await page.keyboard.type('# e2e');
    await expect(save).toBeEnabled();
    await snap(page, 'FILES-editor-save-button-enabled');
  });

  test('FILES-editor-canvas', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor.locator('.monaco-editor').first()).toBeVisible({ timeout: 20_000 });
    await snap(page, 'FILES-editor-canvas');
  });

  test('FILES-editor-statusbar', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor.locator('.monaco-editor').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
    await snap(page, 'FILES-editor-statusbar');
    await editor.locator('.monaco-editor .view-lines').click();
    await page.keyboard.type('# e2e');
    await expect(page.getByText('Unsaved', { exact: true }).first()).toBeVisible();
    await snap(page, 'FILES-editor-statusbar-unsaved');
  });

  test('FILES-editor-clean', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await snap(page, 'FILES-editor-clean');
  });

  test('FILES-editor-dirty', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await editor.locator('.monaco-editor .view-lines').click();
    await page.keyboard.type('# e2e');
    await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await snap(page, 'FILES-editor-dirty');
  });

  test('FILES-editor-saving', async ({ page }) => {
    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { write_managed_text_file: { delayMs: WAIT_LONG } };
      },
    });
    await openFolderRow(page, 'server.properties');
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await editor.locator('.monaco-editor .view-lines').click();
    await page.keyboard.type('# e2e');
    // The Save button runs the same handler as Meta+S and shows the same Saving... state.
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/^Saving\.\.\.$/).first()).toBeVisible();
    await snap(page, 'FILES-editor-saving');
  });

  test('FILES-editor-unsupported-binary', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.jar');
    await expect(page.getByText('This file cannot be edited', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await snap(page, 'FILES-editor-unsupported-binary');
  });

  test('FILES-editor-unsupported-large', async ({ page }) => {
    await openFiles(page, {
      seed: (state) => {
        state.files[`${SERVER_ROOT}/big.txt`] = {
          kind: 'file',
          content: 'x'.repeat(5 * 1024 * 1024 + 1),
          modified: Date.now(),
        };
      },
    });
    await openFolderRow(page, 'big.txt');
    await expect(page.getByText('This file cannot be edited', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await snap(page, 'FILES-editor-unsupported-large');
  });

  test('FILES-editor-loading', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    const loading = page.getByRole('status').filter({ hasText: 'Loading...' });
    try {
      await loading.first().waitFor({ state: 'visible', timeout: 1500 });
      await snap(page, 'FILES-editor-loading');
    } catch {
      recordSkipped(
        'FILES-editor-loading',
        'Monaco mounts within a frame of the file read in the E2E runtime, so the Loading... status over the canvas is shorter than a screenshot can catch. It is transient and has no mock hook.',
      );
    }
  });

  test('FILES-editor-unsaved-confirm', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await editor.locator('.monaco-editor .view-lines').click();
    await page.keyboard.type('# e2e');
    await page.getByRole('button', { name: 'Close editor', exact: true }).click();
    await expect(page.locator('[data-testid="feedback-confirm-confirm"]')).toBeVisible();
    await snap(page, 'FILES-editor-unsaved-confirm');
  });

  test('FILES-editor-keyboard-save', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await editor.locator('.monaco-editor .view-lines').click();
    await page.keyboard.type('# e2e');
    await page.keyboard.press('Meta+s');
    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
    await snap(page, 'FILES-editor-keyboard-save');
  });

  test('FILES-editor-toasts', async ({ page }) => {
    await openFiles(page);
    await openFolderRow(page, 'server.properties');
    const editor = page.getByRole('region', { name: 'server.properties' });
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await editor.locator('.monaco-editor .view-lines').click();
    await page.keyboard.type('# e2e');
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true }).nth(0)).toBeVisible();
    await snap(page, 'FILES-editor-toasts-1');

    await openFiles(page, {
      seed: (state) => {
        state.commandOverrides = { write_managed_text_file: { error: 'E2E write failed' } };
      },
    });
    await openFolderRow(page, 'server.properties');
    const failing = page.getByRole('region', { name: 'server.properties' });
    await expect(failing).toBeVisible({ timeout: 15_000 });
    await failing.locator('.monaco-editor .view-lines').click();
    await page.keyboard.type('# e2e');
    await failing.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Failed to save', { exact: true })).toBeVisible();
    await snap(page, 'FILES-editor-toasts-2');
  });
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

test.describe('Users', () => {
  const usersRoot = 'users-view';

  test('USERS-01', async ({ page }) => {
    await openTab(page, 'users', usersRoot);
    await snap(page, 'USERS-01');
  });

  test('USERS-load-error', async ({ page }) => {
    await openTab(page, 'users', usersRoot, {
      seed: (state) => {
        state.files[`${SERVER_ROOT}/whitelist.json`] = {
          kind: 'file',
          content: '{bad json',
          modified: Date.now(),
        };
      },
    });
    await expect(page.getByText('Could not load the lists', { exact: true })).toBeVisible();
    await snap(page, 'USERS-load-error');
  });

  test('USERS-card-whitelist', async ({ page }) => {
    await openTab(page, 'users', usersRoot);
    const list = page.locator('[data-testid="users-list-whitelist"]');
    await list.locator('[data-testid="users-input-whitelist"]').fill('E2EPlayer');
    await list.locator('[data-testid="users-add-whitelist"]').click();
    await expect(list.getByText('E2EPlayer', { exact: true })).toBeVisible();
    await snapAt(page, list, 'USERS-card-whitelist');
  });

  test('USERS-card-ops', async ({ page }) => {
    await openTab(page, 'users', usersRoot);
    await snapAt(page, page.getByText('No operators', { exact: true }), 'USERS-card-ops');
  });

  test('USERS-card-banned-players', async ({ page }) => {
    await openTab(page, 'users', usersRoot);
    await snapAt(
      page,
      page.getByText('No banned players', { exact: true }),
      'USERS-card-banned-players',
    );
  });

  test('USERS-card-banned-ips', async ({ page }) => {
    await openTab(page, 'users', usersRoot);
    await expect(page.getByText('No banned IP addresses', { exact: true })).toBeVisible();
    await snapAt(
      page,
      page.locator('[data-testid="users-list-banned-ips"]'),
      'USERS-card-banned-ips',
    );
    await openTab(page, 'users', usersRoot, {
      seed: (state) => {
        state.files[`${SERVER_ROOT}/banned-ips.json`] = {
          kind: 'file',
          content: JSON.stringify([{ ip: '203.0.113.7', reason: 'Flooding chat' }]),
          modified: Date.now(),
        };
      },
    });
    await expect(
      page
        .locator('[data-testid="users-list-banned-ips"]')
        .getByText('203.0.113.7', { exact: true }),
    ).toBeVisible();
    await snapAt(
      page,
      page.locator('[data-testid="users-list-banned-ips"]'),
      'USERS-card-banned-ips-rows',
    );
  });

  test('USERS-card-loading', async ({ page }) => {
    await openTab(page, 'users', usersRoot, {
      seed: (state) => {
        state.commandOverrides = { get_player_lists: { delayMs: WAIT_LONG } };
      },
    });
    // The skeleton carries its "Loading..." label as aria-label, not as text.
    await expect(page.locator('[aria-label="Loading..."]').first()).toBeVisible();
    await snap(page, 'USERS-card-loading');
  });

  test('USERS-row', async ({ page }) => {
    await openTab(page, 'users', usersRoot);
    const list = page.locator('[data-testid="users-list-whitelist"]');
    await list.locator('[data-testid="users-input-whitelist"]').fill('E2EPlayer');
    await list.locator('[data-testid="users-add-whitelist"]').click();
    await expect(list.getByText('E2EPlayer', { exact: true })).toBeVisible();
    await snapAt(page, list.getByText('E2EPlayer', { exact: true }), 'USERS-row');
  });

  test('USERS-row-avatar', async ({ page }) => {
    await openTab(page, 'users', usersRoot, {
      seed: (state) => {
        state.files[`${SERVER_ROOT}/whitelist.json`] = {
          kind: 'file',
          content: JSON.stringify([
            { uuid: '00000000-0000-0000-0000-000000000001', name: 'E2EPlayer' },
          ]),
          modified: Date.now(),
        };
      },
    });
    const list = page.locator('[data-testid="users-list-whitelist"]');
    await expect(list.getByText('E2EPlayer', { exact: true })).toBeVisible();
    await snapAt(page, list.getByText('E2EPlayer', { exact: true }), 'USERS-row-avatar');
  });

  test('USERS-row-meta', async ({ page }) => {
    await openTab(page, 'users', usersRoot, {
      seed: (state) => {
        state.files[`${SERVER_ROOT}/ops.json`] = {
          kind: 'file',
          content: JSON.stringify([
            {
              uuid: '00000000-0000-0000-0000-000000000002',
              name: 'E2EAdmin',
              level: 4,
              bypassesPlayerLimit: false,
            },
          ]),
          modified: Date.now(),
        };
        state.files[`${SERVER_ROOT}/banned-players.json`] = {
          kind: 'file',
          content: JSON.stringify([
            { name: 'Griefer', reason: 'Griefing spawn', source: 'Console', expires: 'forever' },
          ]),
          modified: Date.now(),
        };
      },
    });
    await expect(page.getByText('Level: 4', { exact: false }).first()).toBeVisible();
    await snap(page, 'USERS-row-meta');
  });

  test('USERS-add-input', async ({ page }) => {
    await openTab(page, 'users', usersRoot);
    await page.locator('[data-testid="users-input-whitelist"]').fill('Builder_42');
    await snap(page, 'USERS-add-input');
  });

  test('USERS-add-validation', async ({ page }) => {
    await openTab(page, 'users', usersRoot);
    await page.locator('[data-testid="users-add-whitelist"]').click();
    await expect(
      page.getByText('Enter a player name to add.', { exact: true }).first(),
    ).toBeVisible();
    await snap(page, 'USERS-add-validation');
  });

  test('USERS-add-button', async ({ page }) => {
    await openTab(page, 'users', usersRoot, {
      seed: (state) => {
        state.commandOverrides = { mutate_player_list: { delayMs: WAIT_LONG } };
      },
    });
    await page.locator('[data-testid="users-input-whitelist"]').fill('Builder_42');
    await page.locator('[data-testid="users-add-whitelist"]').click();
    await snap(page, 'USERS-add-button');
  });

  test('USERS-remove-confirm', async ({ page }) => {
    await openTab(page, 'users', usersRoot, {
      seed: (state) => {
        state.files[`${SERVER_ROOT}/whitelist.json`] = {
          kind: 'file',
          content: JSON.stringify([{ name: 'E2EPlayer' }]),
          modified: Date.now(),
        };
      },
    });
    const list = page.locator('[data-testid="users-list-whitelist"]');
    await list.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.locator('[data-testid="feedback-confirm-confirm"]')).toBeVisible();
    await snap(page, 'USERS-remove-confirm');
  });

  test('USERS-live-command', async ({ page }) => {
    await openTab(page, 'users', usersRoot, { running: true });
    const list = page.locator('[data-testid="users-list-whitelist"]');
    await list.locator('[data-testid="users-input-whitelist"]').fill('E2EPlayer');
    await list.locator('[data-testid="users-add-whitelist"]').click();
    await expect(list.getByText('E2EPlayer', { exact: true })).toBeVisible();
    await openView(page, 'console');
    await expect(page.getByText('> whitelist add E2EPlayer', { exact: true })).toBeVisible();
    await snap(page, 'USERS-live-command');
  });

  test('USERS-toasts', async ({ page }) => {
    // 1 Already exists (info), 2 List updated (success), 3 Removed (success),
    // 4 Saved to the list, but the server did not apply the change (warning), 5 Could not add to the list (error),
    // 6 Could not remove from the list (error)
    const whitelistWith = (names: string[]) => (state: E2eState) => {
      state.files[`${SERVER_ROOT}/whitelist.json`] = {
        kind: 'file',
        content: JSON.stringify(names.map((name) => ({ name }))),
        modified: Date.now(),
      };
    };
    const addPlayer = async (name: string) => {
      const list = page.locator('[data-testid="users-list-whitelist"]');
      await list.locator('[data-testid="users-input-whitelist"]').fill(name);
      await list.locator('[data-testid="users-add-whitelist"]').click();
    };

    await openTab(page, 'users', usersRoot, { seed: whitelistWith(['E2EPlayer']) });
    await addPlayer('E2EPlayer');
    await expect(page.getByText('Already exists', { exact: true })).toBeVisible();
    await snap(page, 'USERS-toasts-1');

    await openTab(page, 'users', usersRoot);
    await addPlayer('Builder_42');
    await expect(page.getByText('List updated', { exact: true })).toBeVisible();
    await snap(page, 'USERS-toasts-2');

    await openTab(page, 'users', usersRoot, { seed: whitelistWith(['E2EPlayer']) });
    await page
      .locator('[data-testid="users-list-whitelist"]')
      .getByRole('button', { name: 'Remove', exact: true })
      .click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(page.getByText('Removed', { exact: true })).toBeVisible();
    await snap(page, 'USERS-toasts-3');

    await openTab(page, 'users', usersRoot, {
      running: true,
      seed: (state) => {
        state.commandOverrides = { send_command: { error: 'E2E console unavailable' } };
      },
    });
    await addPlayer('Builder_42');
    await expect(
      page.getByText('Saved to the list, but the server did not apply the change', {
        exact: false,
      }),
    ).toBeVisible();
    await snap(page, 'USERS-toasts-4');

    await openTab(page, 'users', usersRoot, {
      seed: (state) => {
        state.commandOverrides = { mutate_player_list: { error: 'E2E list write failed' } };
      },
    });
    await addPlayer('Builder_42');
    await expect(page.getByText('Could not add to the list', { exact: false })).toBeVisible();
    await snap(page, 'USERS-toasts-5');

    await openTab(page, 'users', usersRoot, {
      seed: (state) => {
        whitelistWith(['E2EPlayer'])(state);
        state.commandOverrides = { mutate_player_list: { error: 'E2E list write failed' } };
      },
    });
    await page
      .locator('[data-testid="users-list-whitelist"]')
      .getByRole('button', { name: 'Remove', exact: true })
      .click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(page.getByText('Could not remove from the list', { exact: false })).toBeVisible();
    await snap(page, 'USERS-toasts-6');
  });
});

// ---------------------------------------------------------------------------
// Plugins / Mods
// ---------------------------------------------------------------------------

test.describe('Plugins and mods', () => {
  const VEINMINER_LATEST_JAR = 'VeinMiner-1.21.4.jar';

  test('PLUG-01', async ({ page }) => {
    await openPlugins(page);
    await expect(pluginResult(page, 'veinminer-project')).toBeVisible();
    await snap(page, 'PLUG-01');
  });

  test('PLUG-tab-browse', async ({ page }) => {
    await openPlugins(page);
    await expect(page.getByRole('tab', { name: 'Browse' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await snap(page, 'PLUG-tab-browse');
  });

  test('PLUG-tab-installed', async ({ page }) => {
    await openPlugins(page);
    await page.getByRole('tab', { name: /Installed/ }).click();
    await expect(page.getByRole('tab', { name: /Installed/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await snap(page, 'PLUG-tab-installed');
  });

  test('PLUG-platform-switch', async ({ page }) => {
    await openPlugins(page);
    await expect(page.locator('[data-testid="plugin-provider-hangar"]')).toBeVisible();
    await snap(page, 'PLUG-platform-switch');
    await page.locator('[data-testid="plugin-provider-hangar"]').click();
    await expect(pluginResult(page, 'Example/wireless-redstone')).toBeVisible();
    await snap(page, 'PLUG-platform-switch-hangar');
  });

  test('PLUG-platform-options-mod', async ({ page }) => {
    await openPlugins(page, { scenario: 'fabric-mod-success' });
    await expect(page.locator('[data-testid="plugin-provider-curseforge"]')).toBeVisible();
    await snap(page, 'PLUG-platform-options-mod');
  });

  test('PLUG-platform-options-paper', async ({ page }) => {
    await openPlugins(page);
    await expect(page.locator('[data-testid="plugin-provider-spigot"]')).toBeVisible();
    await snap(page, 'PLUG-platform-options-paper');
  });

  test('PLUG-platform-options-standard', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.servers = state.servers.map((server) => ({ ...server, software: 'Spigot' }));
      },
    });
    await expect(page.locator('[data-testid="plugin-provider-spigot"]')).toBeVisible();
    await expect(page.locator('[data-testid="plugin-provider-hangar"]')).toHaveCount(0);
    await snap(page, 'PLUG-platform-options-standard');
    await openPlugins(page, {
      seed: (state) => {
        state.servers = state.servers.map((server) => ({ ...server, software: 'Vanilla' }));
      },
    });
    await snap(page, 'PLUG-platform-options-standard-vanilla');
  });

  test('PLUG-search-form', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-search-input"]').fill('veinminer');
    await snap(page, 'PLUG-search-form');
    await setCommandOverride(page, 'search_plugin_modrinth', { delayMs: WAIT_LONG });
    await page.locator('[data-testid="plugin-search-submit"]').click();
    await expect(page.getByRole('button', { name: /Searching/ })).toBeVisible();
    await snap(page, 'PLUG-search-form-searching');
  });

  test('PLUG-search-unsupported', async ({ page }) => {
    await openPlugins(page, { scenario: 'fabric-mod-success' });
    await page.locator('[data-testid="plugin-provider-curseforge"]').click();
    await expect(
      page.getByText('This platform is not supported for in-app search.', { exact: true }),
    ).toBeVisible();
    await snap(page, 'PLUG-search-unsupported');
  });

  test('PLUG-sort', async ({ page }) => {
    await openPlugins(page);
    const sort = page.getByRole('combobox', { name: 'Sort this page' });
    await sort.click();
    await snap(page, 'PLUG-sort');
    await page.getByRole('option', { name: 'Downloads', exact: true }).click();
    await expect(sort).toContainText('Downloads');
    await snap(page, 'PLUG-sort-downloads');
  });

  test('PLUG-search-error', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.commandOverrides = { search_plugin_modrinth: { error: 'E2E network down' } };
      },
    });
    await expect(page.locator('[data-testid="plugin-search-error"]')).toBeVisible();
    await snap(page, 'PLUG-search-error');
  });

  test('PLUG-update-summary', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'old', modified: Date.now() };
      },
    });
    await expect(page.getByText('can be updated.', { exact: false })).toBeVisible();
    await snap(page, 'PLUG-update-summary');
  });

  test('PLUG-skeleton', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.commandOverrides = { search_plugin_modrinth: { delayMs: WAIT_LONG } };
      },
    });
    await expect(page.getByLabel('Loading plugins').first()).toBeVisible();
    await snap(page, 'PLUG-skeleton');
  });

  test('PLUG-empty-results', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.commandOverrides = {
          search_plugin_modrinth: { response: { hits: [], total_hits: 0 } },
        };
      },
    });
    await expect(page.getByText('No results.', { exact: true })).toBeVisible();
    await snap(page, 'PLUG-empty-results');
  });

  test('PLUG-card', async ({ page }) => {
    await openPlugins(page);
    await snapAt(page, pluginResult(page, 'veinminer-project'), 'PLUG-card');
  });

  test('PLUG-card-install-idle', async ({ page }) => {
    await openPlugins(page);
    await expect(page.locator('[data-testid="plugin-install-veinminer-project"]')).toHaveText(
      /Install/,
    );
    await snapAt(
      page,
      page.locator('[data-testid="plugin-install-veinminer-project"]'),
      'PLUG-card-install-idle',
    );
  });

  test('PLUG-card-update', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'old', modified: Date.now() };
      },
    });
    await expect(page.locator('[data-testid="plugin-install-veinminer-project"]')).toHaveText(
      /Update/,
    );
    await snapAt(page, pluginResult(page, 'veinminer-project'), 'PLUG-card-update');
  });

  test('PLUG-card-up-to-date', async ({ page }) => {
    // A strict installed match whose file name is the latest build: the update status is up to date, so the card shows
    // the Installed badge and only the Details action. The latest build is named VeinMiner.jar for this capture.
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'jar', modified: Date.now() };
        state.commandOverrides = {
          get_plugin_modrinth_compatible_version: {
            response: {
              id: 'version-1',
              fileName: 'VeinMiner.jar',
              gameVersions: ['1.21.10'],
              dependencies: [],
            },
          },
        };
      },
    });
    const card = pluginResult(page, 'veinminer-project');
    await expect(card.getByText('Installed', { exact: true }).first()).toBeVisible();
    await expect(page.locator('[data-testid="plugin-install-veinminer-project"]')).toHaveCount(0);
    await snapAt(page, card, 'PLUG-card-up-to-date');
  });

  test('PLUG-card-open-external', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.commandOverrides = {
          search_plugin_spiget: {
            response: [
              {
                id: 1,
                name: 'VeinMiner',
                tag: 'Supports Minecraft 1.21.10',
                downloads: 100,
                premium: false,
                external: true,
                authorName: 'Example',
                fileType: 'JAR',
                latestVersionId: 1,
                supportedVersions: ['1.21.10'],
                compatibility: 'compatible',
              },
            ],
          },
        };
      },
    });
    await page.locator('[data-testid="plugin-provider-spigot"]').click();
    await expect(pluginResult(page, '1')).toBeVisible();
    await expect(
      pluginResult(page, '1').getByText('External download required', { exact: false }),
    ).toBeVisible();
    await snapAt(page, pluginResult(page, '1'), 'PLUG-card-open-external');
  });

  test('PLUG-card-preparing', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.commandOverrides = { prepare_plugin_install: { delayMs: WAIT_LONG } };
      },
    });
    await installFromCard(page, 'veinminer-project');
    await expect(page.locator('[data-testid="plugin-install-veinminer-project"]')).toHaveText(
      /Preparing/,
    );
    await snapAt(page, pluginResult(page, 'veinminer-project'), 'PLUG-card-preparing');
  });

  test('PLUG-card-installing', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.commandOverrides = { execute_plugin_install: { delayMs: WAIT_LONG } };
      },
    });
    await installFromCard(page, 'veinminer-project');
    await confirmFeedbackPrimary(page);
    await expect(page.locator('[data-testid="plugin-install-veinminer-project"]')).toHaveText(
      /Installing/,
    );
    await snapAt(page, pluginResult(page, 'veinminer-project'), 'PLUG-card-installing');
  });

  test('PLUG-card-installing-progress', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.commandOverrides = { execute_plugin_install: { delayMs: WAIT_LONG } };
      },
    });
    await installFromCard(page, 'veinminer-project');
    await confirmFeedbackPrimary(page);
    const token = await page.evaluate(() => {
      const runtime = (
        window as unknown as {
          __MC_VECTOR_E2E__?: {
            calls: Array<{ name: string; args?: { request?: { token?: string } } }>;
          };
        }
      ).__MC_VECTOR_E2E__;
      const call = runtime?.calls.filter((entry) => entry.name === 'execute_plugin_install').at(-1);
      return call?.args?.request?.token ?? '';
    });
    expect(token).not.toBe('');
    await emitEvent(page, `download-progress-${token}`, { downloaded: 42, total: 100 });
    await expect(page.locator('[data-testid="plugin-install-veinminer-project"]')).toHaveText(
      /42%/,
    );
    await snapAt(page, pluginResult(page, 'veinminer-project'), 'PLUG-card-installing-progress');
  });

  test('PLUG-card-incompatible', async ({ page }) => {
    await openPlugins(page, { scenario: 'incompatible-plugin' });
    await page.locator('[data-testid="plugin-provider-hangar"]').click();
    await expect(
      pluginResult(page, 'Example/wireless-redstone').getByText('Incompatible', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await snapAt(page, pluginResult(page, 'Example/wireless-redstone'), 'PLUG-card-incompatible');
  });

  test('PLUG-card-install-error', async ({ page }) => {
    await openPlugins(page, { scenario: 'network-retry' });
    await installFromCard(page, 'veinminer-project');
    await confirmFeedbackPrimary(page);
    await expect(
      page.locator('[data-testid="plugin-install-error-veinminer-project"]'),
    ).toBeVisible({ timeout: 15_000 });
    await snapAt(page, pluginResult(page, 'veinminer-project'), 'PLUG-card-install-error');
  });

  test('PLUG-card-details', async ({ page }) => {
    await openPlugins(page);
    await snapAt(
      page,
      page.locator('[data-testid="plugin-details-veinminer-project"]'),
      'PLUG-card-details',
    );
  });

  test('PLUG-detail-dialog', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await expect(page.locator('[data-testid="plugin-detail-dialog"]')).toBeVisible();
    await snap(page, 'PLUG-detail-dialog');
  });

  test('PLUG-detail-header', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await expect(page.locator('[data-testid="plugin-detail-dialog"]')).toBeVisible();
    await snap(page, 'PLUG-detail-header');
  });

  test('PLUG-detail-tabs', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    const dialog = page.locator('[data-testid="plugin-detail-dialog"]');
    await expect(dialog).toBeVisible();
    await snap(page, 'PLUG-detail-tabs');
    await dialog.getByRole('tab', { name: 'README', exact: true }).click();
    await snap(page, 'PLUG-detail-tabs-readme');
  });

  test('PLUG-detail-info', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await expect(
      page.locator('[data-testid="plugin-detail-dialog"]').getByText('Downloads', { exact: true }),
    ).toBeVisible();
    await snap(page, 'PLUG-detail-info');
  });

  test('PLUG-detail-versions', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await expect(
      page.locator('[data-testid="plugin-detail-dialog"]').getByText('1.21.10', { exact: true }),
    ).toBeVisible();
    await snap(page, 'PLUG-detail-versions');
    await openPlugins(page, {
      seed: (state) => {
        state.commandOverrides = {
          search_plugin_modrinth: {
            response: {
              hits: [
                {
                  slug: 'veinminer',
                  project_id: 'veinminer-project',
                  title: 'VeinMiner',
                  description: 'A plugin with no published versions.',
                  author: 'Example',
                  icon_url: '',
                  downloads: 100,
                  project_type: 'plugin',
                  compatibility: 'unknown',
                  supportedVersions: [],
                },
              ],
              total_hits: 1,
            },
          },
        };
      },
    });
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await expect(
      page
        .locator('[data-testid="plugin-detail-dialog"]')
        .getByText('Not published', { exact: true }),
    ).toBeVisible();
    await snap(page, 'PLUG-detail-versions-none');
  });

  test('PLUG-detail-readme', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await page
      .locator('[data-testid="plugin-detail-dialog"]')
      .getByRole('tab', { name: 'README', exact: true })
      .click();
    await expect(
      page.locator('[data-testid="plugin-detail-dialog"]').getByRole('heading').first(),
    ).toBeVisible({ timeout: 15_000 });
    await snap(page, 'PLUG-detail-readme');
  });

  test('PLUG-detail-readme-loading', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.commandOverrides = { get_plugin_modrinth_body: { delayMs: WAIT_LONG } };
      },
    });
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await page
      .locator('[data-testid="plugin-detail-dialog"]')
      .getByRole('tab', { name: 'README', exact: true })
      .click();
    await expect(page.getByText('Fetching README...', { exact: true }).first()).toBeVisible();
    await snap(page, 'PLUG-detail-readme-loading');
  });

  test('PLUG-detail-readme-error', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.commandOverrides = { get_plugin_modrinth_body: { error: 'E2E readme unavailable' } };
      },
    });
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await page
      .locator('[data-testid="plugin-detail-dialog"]')
      .getByRole('tab', { name: 'README', exact: true })
      .click();
    await expect(
      page.getByText('Failed to fetch README. Please try again later.', { exact: true }),
    ).toBeVisible();
    await snap(page, 'PLUG-detail-readme-error');
  });

  test('PLUG-detail-readme-empty', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.commandOverrides = { get_plugin_modrinth_body: { response: '' } };
      },
    });
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await page
      .locator('[data-testid="plugin-detail-dialog"]')
      .getByRole('tab', { name: 'README', exact: true })
      .click();
    await expect(
      page.getByText('No README content is available for this project.', { exact: true }),
    ).toBeVisible();
    await snap(page, 'PLUG-detail-readme-empty');
  });

  test('PLUG-readme-plain-link', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await page
      .locator('[data-testid="plugin-detail-dialog"]')
      .getByRole('tab', { name: 'README', exact: true })
      .click();
    const plain = page
      .locator('[data-testid="plugin-detail-dialog"]')
      .getByText('Report an issue', { exact: true })
      .first();
    await expect(plain).toBeVisible({ timeout: 15_000 });
    await snapTooltip(page, plain, 'github.com/example/veinminer/issues', 'PLUG-readme-plain-link');
  });

  test('PLUG-detail-footer', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    const dialog = page.locator('[data-testid="plugin-detail-dialog"]');
    await expect(dialog.getByRole('button', { name: 'Project Page', exact: false })).toBeVisible();
    await snap(page, 'PLUG-detail-footer');
  });

  test('PLUG-installed-panel', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'jar', modified: Date.now() };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await expect(page.getByText('Installed Plugins', { exact: true })).toBeVisible();
    await snap(page, 'PLUG-installed-panel');
  });

  test('PLUG-installed-empty', async ({ page }) => {
    await openPlugins(page);
    await page.getByRole('tab', { name: /Installed/ }).click();
    await expect(page.getByText('No plugins installed', { exact: true })).toBeVisible();
    await snap(page, 'PLUG-installed-empty');
  });

  test('PLUG-installed-card', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'jar', modified: Date.now() };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await snapAt(page, page.getByText('VeinMiner', { exact: true }).first(), 'PLUG-installed-card');
  });

  test('PLUG-installed-local', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[`${SERVER_ROOT}/plugins/MyLocal-1.0.jar`] = {
          kind: 'file',
          content: 'jar',
          modified: Date.now(),
        };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await expect(page.getByText('MyLocal', { exact: false }).first()).toBeVisible();
    await snap(page, 'PLUG-installed-local');
  });

  test('PLUG-installed-update-available', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'old', modified: Date.now() };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await expect(page.getByText('Update Available', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await snap(page, 'PLUG-installed-update-available');
  });

  test('PLUG-installed-disabled', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[`${SERVER_ROOT}/plugins/VeinMiner.jar.disabled`] = {
          kind: 'file',
          content: 'jar',
          modified: Date.now(),
        };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await expect(page.getByText('Disabled', { exact: true }).first()).toBeVisible();
    await snap(page, 'PLUG-installed-disabled');
  });

  test('PLUG-installed-processing', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'jar', modified: Date.now() };
        state.commandOverrides = { execute_plugin_install: { delayMs: WAIT_LONG } };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await page.getByRole('button', { name: 'Reinstall', exact: true }).first().click();
    const dialog = page.locator('[data-testid="feedback-dialog"]');
    if (await dialog.isVisible().catch(() => false)) await confirmFeedbackPrimary(page);
    await expect(page.getByRole('button', { name: /Installing/ }).first()).toBeVisible({
      timeout: 15_000,
    });
    await snap(page, 'PLUG-installed-processing');
  });

  test('PLUG-installed-actions', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'jar', modified: Date.now() };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await snapAt(
      page,
      page.getByRole('button', { name: 'Uninstall', exact: true }).first(),
      'PLUG-installed-actions',
    );
  });

  test('PLUG-install-preview-dialog', async ({ page }) => {
    await openPlugins(page);
    await installFromCard(page, 'veinminer-project');
    await expect(page.locator('[data-testid="feedback-dialog"]')).toContainText(
      'Install this plugin?',
    );
    await snap(page, 'PLUG-install-preview-dialog');
  });

  test('PLUG-install-list', async ({ page }) => {
    await openPlugins(page);
    await installFromCard(page, 'veinminer-project');
    await expect(page.locator('[data-testid="feedback-dialog"]')).toContainText(
      'VeinMiner-1.21.4.jar',
    );
    await snapAt(
      page,
      page.locator('[data-testid="feedback-dialog"]').getByText('VeinMiner-1.21.4.jar').first(),
      'PLUG-install-list',
    );
  });

  test('PLUG-install-incompatible-dialog', async ({ page }) => {
    await openPlugins(page, { scenario: 'incompatible-plugin' });
    await page.locator('[data-testid="plugin-provider-hangar"]').click();
    await expect(pluginResult(page, 'Example/wireless-redstone')).toBeVisible();
    await installFromCard(page, 'Example/wireless-redstone');
    await expect(page.locator('[data-testid="feedback-dialog"]')).toContainText(
      'Plugin installation blocked',
    );
    await snap(page, 'PLUG-install-incompatible-dialog');
  });

  test('PLUG-install-unverified-dialog', async ({ page }) => {
    await openPlugins(page, { scenario: 'hashless-plugin' });
    await page.locator('[data-testid="plugin-provider-spigot"]').click();
    await expect(pluginResult(page, '1')).toBeVisible();
    await installFromCard(page, '1');
    await confirmFeedbackPrimary(page);
    await expect(page.locator('[data-testid="feedback-dialog"]')).toContainText(
      'Unverified plugin download blocked',
    );
    await snap(page, 'PLUG-install-unverified-dialog');
  });

  test('PLUG-install-checksum-dialog', async ({ page }) => {
    await openPlugins(page, { scenario: 'checksum-mismatch' });
    await installFromCard(page, 'veinminer-project');
    await confirmFeedbackPrimary(page);
    await expect(page.locator('[data-testid="feedback-dialog"]')).toContainText(
      'Plugin integrity check failed',
    );
    await snap(page, 'PLUG-install-checksum-dialog');
  });

  for (const [id, code, title] of [
    ['PLUG-install-source-dialog', 'source-rejected', 'Plugin source rejected'],
    ['PLUG-install-destination-dialog', 'destination-rejected', 'Plugin destination rejected'],
    ['PLUG-install-size-dialog', 'size-limit-exceeded', 'Plugin download is too large'],
  ] as const) {
    test(id, async ({ page }) => {
      await openPlugins(page, {
        seed: (state) => {
          state.commandOverrides = { execute_plugin_install: { error: JSON.stringify({ code }) } };
        },
      });
      await installFromCard(page, 'veinminer-project');
      await confirmFeedbackPrimary(page);
      await expect(page.locator('[data-testid="feedback-dialog"]')).toContainText(title);
      await snap(page, id);
    });
  }

  test('PLUG-duplicate-dialog', async () => {
    // Checked in the E2E runtime: with a strict installed match the card renders no install button (only Details),
    // because PluginResultCard shows the install action only when nothing is installed or an update is available.
    // handleInstall's already-installed branch therefore cannot be reached from the card.
    recordSkipped(
      'PLUG-duplicate-dialog',
      'Feedback dialog "Already installed" (Overwrite or Update). Unreachable from the UI: PluginResultCard shows the install button only when nothing is installed or an update is available (showInstallAction), so a strict installed match never reaches handleInstall duplicate branch. Confirmed in the E2E run: the card shows no install button for an installed file.',
    );
  });

  test('PLUG-open-browser-error', async ({ page }) => {
    await openPlugins(page);
    await setWindowFlag(page, '__openerFail', true);
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await page
      .locator('[data-testid="plugin-detail-dialog"]')
      .getByRole('button', { name: 'Project Page', exact: false })
      .click();
    await expect(page.locator('[data-testid="feedback-dialog"]')).toContainText(
      'Could not open browser',
    );
    await snap(page, 'PLUG-open-browser-error');
  });

  test('PLUG-toggle-error', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'jar', modified: Date.now() };
        state.commandOverrides = { toggle_installed_plugin: { error: 'E2E toggle failed' } };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await page.getByRole('button', { name: 'Disable', exact: true }).first().click();
    await expect(page.locator('[data-testid="feedback-dialog"]')).toContainText(
      'Could not change plugin state',
    );
    await snap(page, 'PLUG-toggle-error');
  });

  test('PLUG-uninstall-confirm', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'jar', modified: Date.now() };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await page.getByRole('button', { name: 'Uninstall', exact: true }).first().click();
    await expect(page.locator('[data-testid="feedback-confirm-confirm"]')).toBeVisible();
    await snap(page, 'PLUG-uninstall-confirm');
  });

  test('PLUG-uninstall-error', async ({ page }) => {
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'jar', modified: Date.now() };
        state.commandOverrides = { uninstall_installed_plugin: { error: 'E2E uninstall failed' } };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await page.getByRole('button', { name: 'Uninstall', exact: true }).first().click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(page.locator('[data-testid="feedback-dialog"]')).toContainText(
      'Could not uninstall plugin',
    );
    await snap(page, 'PLUG-uninstall-error');
  });

  test('PLUG-pager-modrinth', async ({ page }) => {
    await openPlugins(page);
    await expect(page.getByRole('navigation', { name: 'Result pages' })).toBeVisible();
    await snap(page, 'PLUG-pager-modrinth');
    await openPlugins(page, {
      seed: (state) => {
        const hit = {
          slug: 'veinminer',
          project_id: 'veinminer-project',
          title: 'VeinMiner',
          description: 'A plugin for Minecraft 1.21.10.',
          author: 'Example',
          icon_url: '',
          downloads: 100,
          project_type: 'plugin',
          compatibility: 'compatible',
          supportedVersions: ['1.21.10'],
        };
        state.commandOverrides = {
          search_plugin_modrinth: { response: { hits: [hit], total_hits: 60 } },
        };
      },
    });
    await expect(page.getByRole('navigation', { name: 'Result pages' })).toBeVisible();
    await snap(page, 'PLUG-pager-modrinth-many');
  });

  test('PLUG-pager-simple', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-provider-hangar"]').click();
    await expect(page.locator('[data-testid="plugin-next-page"]')).toBeDisabled();
    await snap(page, 'PLUG-pager-simple');
  });

  test('PLUG-pager-jump', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-page-input"]').fill('1');
    await page.locator('[data-testid="plugin-page-go"]').click();
    await snap(page, 'PLUG-pager-jump');
  });

  test('PLUG-pager-jump-invalid', async ({ page }) => {
    // Hangar has no page count, so the jump is not clamped and the invalid-page toast is reached.
    await openPlugins(page);
    await page.locator('[data-testid="plugin-provider-hangar"]').click();
    await page.locator('[data-testid="plugin-page-input"]').fill('0');
    await bypassPagerValidation(page);
    await page.locator('[data-testid="plugin-page-go"]').click();
    await expect(
      page.getByText('Please enter a page number of 1 or higher.', { exact: true }).first(),
    ).toBeVisible();
    await snap(page, 'PLUG-pager-jump-invalid');
  });

  test('PLUG-logo-fallback', async ({ page }) => {
    await openPlugins(page);
    await page.locator('[data-testid="plugin-provider-hangar"]').click();
    await snap(page, 'PLUG-logo-fallback');
  });

  test('PLUG-toasts', async ({ page }) => {
    // 1 Installed: VeinMiner, 2 Overwritten: VeinMiner, 3 Updated: VeinMiner, 4 VeinMiner enabled,
    // 5 VeinMiner disabled, 6 Uninstalled: VeinMiner, 7 Please enter a page number of 1 or higher.
    // 8 (Reinstall is unavailable for locally added files) cannot be clicked: the button is disabled. Skipped.
    await openPlugins(page);
    await installFromCard(page, 'veinminer-project');
    await confirmFeedbackPrimary(page);
    await expect(page.getByText('Installed: VeinMiner', { exact: true })).toBeVisible();
    await snap(page, 'PLUG-toasts-1');

    // Reinstall on the installed card overwrites the existing file; that is the reachable route to "Overwritten".
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'jar', modified: Date.now() };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await page.getByRole('button', { name: 'Reinstall', exact: true }).first().click();
    if (
      await page
        .locator('[data-testid="feedback-dialog"]')
        .isVisible()
        .catch(() => false)
    ) {
      await confirmFeedbackPrimary(page);
    }
    await expect(page.getByText('Overwritten: VeinMiner', { exact: true })).toBeVisible();
    await snap(page, 'PLUG-toasts-2');

    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'old', modified: Date.now() };
      },
    });
    await installFromCard(page, 'veinminer-project');
    await confirmFeedbackPrimary(page);
    await expect(page.getByText('Updated: VeinMiner', { exact: true })).toBeVisible();
    await snap(page, 'PLUG-toasts-3');

    await openPlugins(page, {
      seed: (state) => {
        state.files[`${SERVER_ROOT}/plugins/VeinMiner.jar.disabled`] = {
          kind: 'file',
          content: 'jar',
          modified: Date.now(),
        };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await page.getByRole('button', { name: 'Enable', exact: true }).first().click();
    await expect(page.getByText('VeinMiner enabled', { exact: false })).toBeVisible();
    await snap(page, 'PLUG-toasts-4');

    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'jar', modified: Date.now() };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await page.getByRole('button', { name: 'Disable', exact: true }).first().click();
    await expect(page.getByText('VeinMiner disabled', { exact: false })).toBeVisible();
    await snap(page, 'PLUG-toasts-5');

    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'jar', modified: Date.now() };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    await page.getByRole('button', { name: 'Uninstall', exact: true }).first().click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(page.getByText('Uninstalled: VeinMiner', { exact: true })).toBeVisible();
    await snap(page, 'PLUG-toasts-6');

    await openPlugins(page);
    await page.locator('[data-testid="plugin-provider-hangar"]').click();
    await page.locator('[data-testid="plugin-page-input"]').fill('0');
    await bypassPagerValidation(page);
    await page.locator('[data-testid="plugin-page-go"]').click();
    await expect(
      page.getByText('Please enter a page number of 1 or higher.', { exact: true }).first(),
    ).toBeVisible();
    await snap(page, 'PLUG-toasts-7');

    recordSkipped(
      'PLUG-toasts-8',
      'Info toast "Reinstall is unavailable for locally added files". The Reinstall button is disabled for local files, and the UI prevents the click, so the toast cannot be reached from the UI.',
    );
  });

  test('PLUG-tooltips', async ({ page }) => {
    // 1 Mods and datapacks (Modrinth, mod server), 2 Plugins and mods (Modrinth, plugin server),
    // 3 Paper plugins (Hangar), 4 Via the Spiget API (SpigotMC), 5 Opens in your browser (CurseForge),
    // 6 README link raw href (unapproved host), 7 Latest: file name (update badge).
    await openPlugins(page, { scenario: 'fabric-mod-success' });
    await snapTooltip(
      page,
      page.locator('[data-testid="plugin-provider-modrinth"]'),
      'Mods and datapacks',
      'PLUG-tooltips-1',
    );
    await openPlugins(page);
    await snapTooltip(
      page,
      page.locator('[data-testid="plugin-provider-modrinth"]'),
      'Plugins and mods',
      'PLUG-tooltips-2',
    );
    await snapTooltip(
      page,
      page.locator('[data-testid="plugin-provider-hangar"]'),
      'Paper plugins',
      'PLUG-tooltips-3',
    );
    await snapTooltip(
      page,
      page.locator('[data-testid="plugin-provider-spigot"]'),
      'Via the Spiget API',
      'PLUG-tooltips-4',
    );
    await openPlugins(page, { scenario: 'fabric-mod-success' });
    await snapTooltip(
      page,
      page.locator('[data-testid="plugin-provider-curseforge"]'),
      'Opens in your browser',
      'PLUG-tooltips-5',
    );
    await openPlugins(page);
    await page.locator('[data-testid="plugin-details-veinminer-project"]').click();
    await page
      .locator('[data-testid="plugin-detail-dialog"]')
      .getByRole('tab', { name: 'README', exact: true })
      .click();
    const plain = page
      .locator('[data-testid="plugin-detail-dialog"]')
      .getByText('Report an issue', { exact: true })
      .first();
    await expect(plain).toBeVisible({ timeout: 15_000 });
    // The README is still re-rendering right after it appears; let it settle so the hover lands on the final node.
    await page.waitForTimeout(400);
    await snapTooltip(page, plain, 'github.com/example/veinminer/issues', 'PLUG-tooltips-6');
    await openPlugins(page, {
      seed: (state) => {
        state.files[VEINMINER_JAR] = { kind: 'file', content: 'old', modified: Date.now() };
      },
    });
    await page.getByRole('tab', { name: /Installed/ }).click();
    // The update badge exposes "Latest: {file}" as a native title attribute. The OS draws native titles outside
    // the page, so the attribute is asserted and the screenshot is recorded as skipped.
    await expect(page.locator(`[title="Latest: ${VEINMINER_LATEST_JAR}"]`).first()).toBeAttached();
    recordSkipped(
      'PLUG-tooltips-7',
      `Update badge tooltip "Latest: ${VEINMINER_LATEST_JAR}" is a native title attribute, drawn by the OS outside the page. The attribute is asserted in the E2E run, but a page screenshot cannot show it.`,
    );
  });
});

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

test.describe('Backups', () => {
  test('BACKUP-01', async ({ page }) => {
    await openBackups(page);
    await expect(backupRow(page, 'e2e-backup-a.zip')).toBeVisible();
    await snap(page, 'BACKUP-01');
  });

  test('BACKUP-header-create', async ({ page }) => {
    await openBackups(page);
    await expect(page.locator('[data-testid="backups-create-button"]')).toHaveText(/Create Backup/);
    await snapAt(
      page,
      page.locator('[data-testid="backups-create-button"]'),
      'BACKUP-header-create',
    );
    await openBackups(page, {
      overrides: { restore_managed_backup: { delayMs: WAIT_LONG } },
    });
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(page.locator('[data-testid="backups-create-button"]')).toHaveText(/Processing/);
    await snap(page, 'BACKUP-header-create-processing');
  });

  test('BACKUP-catalog-error', async ({ page }) => {
    await openBackups(page, {
      seed: (state) => {
        state.files[catalogPath] = { kind: 'file', content: 'not json', modified: Date.now() };
      },
    });
    await expect(page.locator('[data-testid="backups-catalog-alert"]')).toBeVisible();
    await snap(page, 'BACKUP-catalog-error');
  });

  test('BACKUP-restoring', async ({ page }) => {
    await openBackups(page, { overrides: { restore_managed_backup: { delayMs: WAIT_LONG } } });
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(page.getByText('Restoring e2e-backup-a.zip...', { exact: false })).toBeVisible();
    await snap(page, 'BACKUP-restoring');
  });

  test('BACKUP-loading', async ({ page }) => {
    await openBackups(page, { overrides: { list_managed_backups: { delayMs: WAIT_LONG } } });
    await expect(page.locator('[aria-label="Loading..."]').first()).toBeVisible();
    await snap(page, 'BACKUP-loading');
  });

  test('BACKUP-empty', async ({ page }) => {
    await openTab(page, 'backups', 'backups-view', { scenario: 'backup-flow' });
    await expect(page.getByText('No backups yet', { exact: true })).toBeVisible();
    await snap(page, 'BACKUP-empty');
  });

  test('BACKUP-row', async ({ page }) => {
    await openBackups(page);
    await snapAt(page, backupRow(page, 'e2e-backup-a.zip'), 'BACKUP-row');
  });

  test('BACKUP-row-tagged', async ({ page }) => {
    await openBackups(page, {
      seed: (state) => {
        state.files[catalogPath] = { kind: 'file', content: taggedCatalog, modified: Date.now() };
      },
    });
    await expect(page.getByText('before-update', { exact: true })).toBeVisible();
    await snapAt(page, backupRow(page, 'e2e-backup-a.zip'), 'BACKUP-row-tagged');
  });

  test('BACKUP-row-processing', async ({ page }) => {
    await openBackups(page, { overrides: { restore_managed_backup: { delayMs: WAIT_LONG } } });
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(
      backupRow(page, 'e2e-backup-b.zip').getByRole('button', { name: 'Delete', exact: true }),
    ).toBeDisabled();
    await snap(page, 'BACKUP-row-processing');
  });

  test('BACKUP-restore-confirm', async ({ page }) => {
    await openBackups(page);
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await expect(page.locator('[data-testid="feedback-confirm-confirm"]')).toBeVisible();
    await snap(page, 'BACKUP-restore-confirm');
  });

  test('BACKUP-delete-confirm', async ({ page }) => {
    await openBackups(page);
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(page.locator('[data-testid="feedback-confirm-confirm"]')).toBeVisible();
    await snap(page, 'BACKUP-delete-confirm');
  });

  test('BACKUP-create-dialog', async ({ page }) => {
    await openBackups(page);
    await page.locator('[data-testid="backups-create-button"]').click();
    await expect(page.locator('[data-testid="backups-target-size"]')).toBeVisible();
    await snap(page, 'BACKUP-create-dialog');
  });

  test('BACKUP-create-name', async ({ page }) => {
    await openBackups(page);
    await page.locator('[data-testid="backups-create-button"]').click();
    const name = page.locator('[data-testid="backup-name-input"]');
    await expect(name).toBeVisible();
    await snap(page, 'BACKUP-create-name');
    await name.fill('e2e-manual.zip');
    await snap(page, 'BACKUP-create-name-typed');
  });

  test('BACKUP-create-compression', async ({ page }) => {
    await openBackups(page);
    await page.locator('[data-testid="backups-create-button"]').click();
    await page.getByRole('combobox', { name: /Compression level/ }).click();
    await snap(page, 'BACKUP-create-compression');
    await page.getByRole('option', { name: '9', exact: true }).click();
    await expect(page.getByRole('combobox', { name: /Compression level/ })).toContainText('9');
    await snap(page, 'BACKUP-create-compression-9');
  });

  test('BACKUP-create-target-size', async ({ page }) => {
    await openBackups(page, { overrides: { get_managed_directory_size: { delayMs: WAIT_LONG } } });
    await page.locator('[data-testid="backups-create-button"]').click();
    await expect(page.locator('[data-testid="backups-target-size"]')).toHaveText('…');
    await snap(page, 'BACKUP-create-target-size');
  });

  test('BACKUP-create-estimate', async ({ page }) => {
    await openBackups(page, {
      overrides: {
        list_managed_backups: {
          response: backupRecords(['e2e-backup-a.zip', 'e2e-backup-b.zip'], 20_000),
        },
      },
    });
    await page.locator('[data-testid="backups-create-button"]').click();
    await expect(page.locator('[data-testid="backups-estimated-time"]')).toContainText('About');
    await snap(page, 'BACKUP-create-estimate');
  });

  test('BACKUP-create-name-invalid', async ({ page }) => {
    await openBackups(page);
    await page.locator('[data-testid="backups-create-button"]').click();
    await page.locator('[data-testid="backup-name-input"]').fill('bad:name');
    await expect(
      page.getByText('Backup name contains unsupported characters', { exact: false }).first(),
    ).toBeVisible();
    await snap(page, 'BACKUP-create-name-invalid');
  });

  test('BACKUP-create-stop-confirm', async ({ page }) => {
    await openBackups(page, { running: true });
    await page.locator('[data-testid="backups-create-button"]').click();
    await expect(page.locator('[data-testid="backups-target-size"]')).toBeVisible();
    await page.locator('[data-testid="backups-create-submit"]').click();
    await expect(page.locator('[data-testid="feedback-confirm-confirm"]')).toBeVisible();
    await snap(page, 'BACKUP-create-stop-confirm');
  });

  test('BACKUP-create-toasts', async ({ page }) => {
    // 1 Backup created! (success), 2 Failed to create backup (error), 3 The backup was created, but the server
    // could not be restarted (warning), 4 The server could not be stopped (no backup) (error),
    // 5 Backup created, but its metadata could not be saved (warning).
    await openBackups(page);
    await page.locator('[data-testid="backups-create-button"]').click();
    await expect(page.locator('[data-testid="backups-target-size"]')).toBeVisible();
    await page.locator('[data-testid="backups-create-submit"]').click();
    await expect(page.getByText('Backup created!', { exact: true })).toBeVisible();
    await snap(page, 'BACKUP-create-toasts-1');

    await openBackups(page, {
      overrides: { create_managed_backup: { error: 'E2E archive failed' } },
    });
    await page.locator('[data-testid="backups-create-button"]').click();
    await expect(page.locator('[data-testid="backups-target-size"]')).toBeVisible();
    await page.locator('[data-testid="backups-create-submit"]').click();
    await expect(page.getByText('Failed to create backup', { exact: true })).toBeVisible();
    await snap(page, 'BACKUP-create-toasts-2');

    await openBackups(page, {
      running: true,
      overrides: {
        create_managed_backup: {
          response: {
            status: 'created',
            backupName: 'e2e-restart.zip',
            catalogError: null,
            restart: { status: 'failed', error: 'E2E start failed' },
          },
        },
      },
    });
    await page.locator('[data-testid="backups-create-button"]').click();
    await expect(page.locator('[data-testid="backups-target-size"]')).toBeVisible();
    await page.locator('[data-testid="backups-create-submit"]').click();
    await expect(
      page.getByText('The backup was created, but the server could not be restarted', {
        exact: false,
      }),
    ).toBeVisible();
    await snap(page, 'BACKUP-create-toasts-3');

    // The stop is requested, confirmed, and still reported as required: the view says the server could not be stopped.
    await openBackups(page, {
      running: true,
      overrides: { create_managed_backup: { response: { status: 'confirmation_required' } } },
    });
    await page.locator('[data-testid="backups-create-button"]').click();
    await expect(page.locator('[data-testid="backups-target-size"]')).toBeVisible();
    await page.locator('[data-testid="backups-create-submit"]').click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(
      page
        .getByText('The server could not be stopped, so no backup was created', { exact: false })
        .first(),
    ).toBeVisible();
    await snap(page, 'BACKUP-create-toasts-4');

    await openBackups(page, {
      overrides: {
        create_managed_backup: {
          response: {
            status: 'created',
            backupName: 'e2e-meta.zip',
            catalogError: null,
            restart: { status: 'not_needed' },
          },
        },
        // The catalog write is what fails, so the backup is created but its metadata is not saved.
        write_managed_text_file: { error: 'E2E catalog write failed' },
      },
    });
    await page.locator('[data-testid="backups-create-button"]').click();
    await expect(page.locator('[data-testid="backups-target-size"]')).toBeVisible();
    await page.locator('[data-testid="backups-create-submit"]').click();
    await expect(
      page.getByText('Backup created, but its metadata could not be saved', { exact: false }),
    ).toBeVisible();
    await snap(page, 'BACKUP-create-toasts-5');
  });

  test('BACKUP-tag-dialog', async ({ page }) => {
    await openBackups(page);
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Tag', exact: true })
      .click();
    await expect(page.locator('[data-testid="backups-tag-dialog"]')).toBeVisible();
    await snap(page, 'BACKUP-tag-dialog');
  });

  test('BACKUP-tag-input', async ({ page }) => {
    await openBackups(page);
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Tag', exact: true })
      .click();
    const dialog = page.locator('[data-testid="backups-tag-dialog"]');
    await dialog.getByLabel('Add tag', { exact: true }).fill('before-update');
    await snap(page, 'BACKUP-tag-input');
  });

  test('BACKUP-tag-chips', async ({ page }) => {
    await openBackups(page);
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Tag', exact: true })
      .click();
    const dialog = page.locator('[data-testid="backups-tag-dialog"]');
    await expect(dialog.getByText('No tags yet', { exact: true })).toBeVisible();
    await snap(page, 'BACKUP-tag-chips-empty');
    await dialog.getByLabel('Add tag', { exact: true }).fill('before-update');
    await dialog.getByLabel('Add tag', { exact: true }).press('Enter');
    await expect(dialog.getByRole('group', { name: 'Tags' })).toBeVisible();
    await snap(page, 'BACKUP-tag-chips');
    await dialog
      .getByRole('group', { name: 'Tags' })
      .getByRole('button', { name: /before-update/ })
      .first()
      .click();
    await expect(dialog.getByText('No tags yet', { exact: true })).toBeVisible();
  });

  test('BACKUP-tag-note', async ({ page }) => {
    await openBackups(page);
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Tag', exact: true })
      .click();
    const dialog = page.locator('[data-testid="backups-tag-dialog"]');
    await dialog.getByLabel('Note', { exact: true }).fill('Taken before the upgrade');
    await snap(page, 'BACKUP-tag-note');
  });

  test('BACKUP-tag-toasts', async ({ page }) => {
    await openBackups(page);
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Tag', exact: true })
      .click();
    const dialog = page.locator('[data-testid="backups-tag-dialog"]');
    await dialog.getByLabel('Add tag', { exact: true }).fill('before-update');
    await dialog.getByLabel('Add tag', { exact: true }).press('Enter');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Backup tags saved', { exact: true })).toBeVisible();
    await snap(page, 'BACKUP-tag-toasts-1');

    await openBackups(page, {
      overrides: { write_managed_text_file: { error: 'E2E catalog write failed' } },
    });
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Tag', exact: true })
      .click();
    await page
      .locator('[data-testid="backups-tag-dialog"]')
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    await expect(page.getByText('Failed to save backup tags', { exact: true })).toBeVisible();
    await snap(page, 'BACKUP-tag-toasts-2');
  });

  test('BACKUP-toasts', async ({ page }) => {
    // 1 Restore completed!, 2 Failed to restore backup, 3 Backup deleted, 4 Failed to delete backup,
    // 5 Failed to load backups, 6 Backup deleted, but its metadata could not be updated
    await openBackups(page);
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(page.getByText('Restore completed!', { exact: true })).toBeVisible();
    await snap(page, 'BACKUP-toasts-1');

    await openBackups(page, {
      overrides: { restore_managed_backup: { error: 'E2E restore failed' } },
    });
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(page.getByText('Failed to restore backup', { exact: true })).toBeVisible();
    await snap(page, 'BACKUP-toasts-2');

    // Backup deletion is blocked in every build: src/lib/backup-commands.ts calls delete_managed_backup, which is
    // missing from src/lib/tauri-command-allowlist.ts. So "Backup deleted" never appears, and Delete reports a failure.
    recordSkipped(
      'BACKUP-toasts-3',
      'Success toast "Backup deleted". Unreachable in every build: delete_managed_backup is missing from src/lib/tauri-command-allowlist.ts, so tauriInvoke throws "Blocked tauri command" and the success branch never runs.',
    );

    await openBackups(page);
    await backupRow(page, 'e2e-backup-a.zip')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await page.locator('[data-testid="feedback-confirm-confirm"]').click();
    await expect(page.getByText('Failed to delete backup', { exact: true })).toBeVisible();
    await snap(page, 'BACKUP-toasts-4');

    await openBackups(page, { overrides: { list_managed_backups: { error: 'E2E list failed' } } });
    await expect(page.getByText('Failed to load backups', { exact: true })).toBeVisible();
    await snap(page, 'BACKUP-toasts-5');

    recordSkipped(
      'BACKUP-toasts-6',
      'Warning "Backup deleted, but its metadata could not be updated". Unreachable: it follows a successful delete, and delete_managed_backup is blocked by the frontend command allowlist in every build.',
    );
  });

  test('BACKUP-shortcut-create', async ({ page }) => {
    await openBackups(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Meta+Shift+c');
    await expect(page.locator('[data-testid="backups-create-dialog"]')).toBeVisible();
    await snap(page, 'BACKUP-shortcut-create');
  });

  test('BACKUP-tooltips', async ({ page }) => {
    // 1 Target size: "The whole server folder is backed up."
    // 2 Estimated time: "Based on the median speed of the last {count} backups." (needs durations)
    // 3 ZIP filename: '"{default}" will be used if omitted'
    // 4 Compression: "1: Low compression / 9: High compression"
    await openBackups(page, {
      overrides: {
        list_managed_backups: {
          response: backupRecords(['e2e-backup-a.zip', 'e2e-backup-b.zip'], 20_000),
        },
      },
    });
    await page.locator('[data-testid="backups-create-button"]').click();
    await expect(page.locator('[data-testid="backups-target-size"]')).toBeVisible();
    const dialog = page.locator('[data-testid="backups-create-dialog"]');
    await snapTooltip(
      page,
      dialog.getByRole('button', { name: /Target size.*More info/ }),
      'The whole server folder is backed up.',
      'BACKUP-tooltips-1',
    );
    await snapTooltip(
      page,
      dialog.getByRole('button', { name: /Estimated time.*More info/ }),
      'Based on the median speed',
      'BACKUP-tooltips-2',
    );
    await snapTooltip(
      page,
      dialog.getByRole('button', { name: /ZIP filename.*More info/ }),
      'will be used if omitted',
      'BACKUP-tooltips-3',
    );
    await snapTooltip(
      page,
      dialog.getByRole('button', { name: /Compression level.*More info/ }),
      '1: Low compression',
      'BACKUP-tooltips-4',
    );
  });
});

// ---------------------------------------------------------------------------
// Server Properties
// ---------------------------------------------------------------------------

test.describe('Server Properties', () => {
  const advancedPropertiesFile = [
    'motd=E2E Server',
    'gamemode=survival',
    'server-port=25565',
    'log-ips=true',
    'max-tick-time=60000',
    'max-chained-neighbor-updates=1000000',
    'enable-jmx-monitoring=false',
    'hide-online-players=false',
    'region-file-compression=deflate',
    '',
  ].join('\n');

  test('PROPS-01', async ({ page }) => {
    await openPropertiesFor(page);
    await snap(page, 'PROPS-01');
  });

  test('PROPS-search', async ({ page }) => {
    await openPropertiesFor(page);
    await page.getByLabel('Search properties', { exact: true }).fill('motd');
    await snap(page, 'PROPS-search');
  });

  test('PROPS-search-empty', async ({ page }) => {
    await openPropertiesFor(page);
    await page.getByLabel('Search properties', { exact: true }).fill('zzzz');
    await expect(page.getByText('No matching properties', { exact: true })).toBeVisible();
    await snap(page, 'PROPS-search-empty');
  });

  test('PROPS-unsaved', async ({ page }) => {
    await openPropertiesFor(page);
    await propMotd(page).fill('E2E properties update');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await snap(page, 'PROPS-unsaved');
  });

  test('PROPS-save-button', async ({ page }) => {
    await openPropertiesFor(page);
    const save = page.locator('[data-testid="properties-save-button"]');
    await expect(save).toBeDisabled();
    await snap(page, 'PROPS-save-button-disabled');
    await propMotd(page).fill('E2E properties update');
    await expect(save).toBeEnabled();
    await snap(page, 'PROPS-save-button');
    await save.click();
    await expect(page.getByText('Properties saved', { exact: true })).toBeVisible();
    await snap(page, 'PROPS-save-button-saved');
    await openPropertiesFor(page, {
      seed: (state) => {
        state.commandOverrides = { save_server_properties: { error: 'E2E save failed' } };
      },
    });
    await propMotd(page).fill('E2E properties update');
    await page.locator('[data-testid="properties-save-button"]').click();
    await expect(page.getByText('Failed to save properties', { exact: true })).toBeVisible();
    await snap(page, 'PROPS-save-button-error');
  });

  test('PROPS-loading', async ({ page }) => {
    // The loading state replaces the whole view, so the view root test id is not present yet.
    await openApp(page, {
      seed: (state) => {
        state.commandOverrides = { get_server_properties: { delayMs: WAIT_LONG } };
      },
    });
    await openView(page, 'properties');
    await expect(page.locator('[data-testid="properties-loading"]')).toBeVisible();
    await snap(page, 'PROPS-loading');
  });

  test('PROPS-load-error', async ({ page }) => {
    await openPropertiesFor(page, {
      seed: (state) => {
        state.commandOverrides = { get_server_properties: { error: 'E2E properties unreadable' } };
      },
    });
    await expect(page.getByText('Failed to load server properties', { exact: true })).toBeVisible();
    await snap(page, 'PROPS-load-error');
  });

  test('PROPS-basic-card', async ({ page }) => {
    await openPropertiesFor(page);
    await snapAt(page, page.getByText('Basic Settings', { exact: true }), 'PROPS-basic-card');
  });

  test('PROPS-gameplay-card', async ({ page }) => {
    await openPropertiesFor(page);
    await snapAt(page, page.getByText('Gameplay', { exact: true }), 'PROPS-gameplay-card');
  });

  test('PROPS-network-card', async ({ page }) => {
    await openPropertiesFor(page);
    await snapAt(
      page,
      page.getByText('Connection / Network', { exact: true }),
      'PROPS-network-card',
    );
  });

  test('PROPS-card-remote', async ({ page }) => {
    await openPropertiesFor(page);
    await snapAt(page, page.getByText('RCON & Query', { exact: true }), 'PROPS-card-remote');
  });

  test('PROPS-card-world', async ({ page }) => {
    await openPropertiesFor(page);
    await snapAt(page, page.getByText('World', { exact: true }), 'PROPS-card-world');
  });

  test('PROPS-card-general', async ({ page }) => {
    await openPropertiesFor(page);
    await snapAt(page, page.getByText('General', { exact: true }), 'PROPS-card-general');
  });

  test('PROPS-card-security', async ({ page }) => {
    await openPropertiesFor(page);
    await snapAt(page, page.getByText('Security', { exact: true }), 'PROPS-card-security');
  });

  test('PROPS-card-resource-pack', async ({ page }) => {
    await openPropertiesFor(page);
    await snapAt(
      page,
      page.getByText('Resource Pack', { exact: true }),
      'PROPS-card-resource-pack',
    );
  });

  test('PROPS-card-management', async ({ page }) => {
    await openPropertiesFor(page);
    await snapAt(
      page,
      page.getByText('Management Server', { exact: true }),
      'PROPS-card-management',
    );
  });

  test('PROPS-advanced-hidden', async ({ page }) => {
    await openPropertiesFor(page, {
      seed: (state) => {
        state.files[`${SERVER_ROOT}/server.properties`] = {
          kind: 'file',
          content: advancedPropertiesFile,
          modified: Date.now(),
        };
      },
    });
    await expect(page.getByText('Basic Settings', { exact: true })).toBeVisible();
    await expect(page.getByText('Advanced', { exact: true })).toHaveCount(0);
    await snap(page, 'PROPS-advanced-hidden');
  });

  test('PROPS-column-layout', async ({ page }) => {
    await openPropertiesFor(page);
    await snap(page, 'PROPS-column-layout');
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(400);
    await snap(page, 'PROPS-column-layout-narrow');
  });

  test('PROPS-toggle-row', async ({ page }) => {
    await openPropertiesFor(page);
    const pvp = page.locator('[data-testid="properties-toggle-pvp"]');
    await snapAt(page, pvp, 'PROPS-toggle-row');
  });

  test('PROPS-field-hint', async ({ page }) => {
    await openPropertiesFor(page);
    await page.getByText('World', { exact: true }).first().scrollIntoViewIfNeeded();
    const hint = page.getByRole('button', { name: /View distance.*More info/ }).first();
    await snapTooltip(page, hint, '(view-distance)', 'PROPS-field-hint');
  });

  test('PROPS-secret-field', async ({ page }) => {
    await openPropertiesFor(page);
    const rcon = page.getByText('RCON & Query', { exact: true });
    await rcon.scrollIntoViewIfNeeded();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await snap(page, 'PROPS-secret-field');
    const reveal = page.getByRole('button', { name: /show|reveal/i }).first();
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click();
      await snap(page, 'PROPS-secret-field-revealed');
    }
  });

  test('PROPS-number-clamp', async ({ page }) => {
    await openPropertiesFor(page);
    const port = page.getByLabel('Server Port', { exact: true });
    await port.fill('99999');
    await port.blur();
    await expect(port).toHaveValue('65535');
    await snap(page, 'PROPS-number-clamp');
  });

  test('PROPS-unsaved-nav-confirm', async ({ page }) => {
    await openPropertiesFor(page);
    await propMotd(page).fill('E2E properties update');
    await page.locator('[data-testid="nav-item-dashboard"]').click();
    await expect(page.locator('[data-testid="feedback-confirm-confirm"]')).toBeVisible();
    await snap(page, 'PROPS-unsaved-nav-confirm');
  });

  test('PROPS-toasts', async ({ page }) => {
    await openPropertiesFor(page);
    await propMotd(page).fill('E2E properties update');
    await page.locator('[data-testid="properties-save-button"]').click();
    await expect(page.getByText('Properties saved', { exact: true })).toBeVisible();
    await snap(page, 'PROPS-toasts-1');
    await openPropertiesFor(page, {
      seed: (state) => {
        state.commandOverrides = { save_server_properties: { error: 'E2E save failed' } };
      },
    });
    await propMotd(page).fill('E2E properties update');
    await page.locator('[data-testid="properties-save-button"]').click();
    await expect(page.getByText('Failed to save properties', { exact: true })).toBeVisible();
    await snap(page, 'PROPS-toasts-2');
  });
});

// ---------------------------------------------------------------------------
// General Settings
// ---------------------------------------------------------------------------

test.describe('General Settings', () => {
  const nameInput = '[data-testid="server-settings-name-input"]';

  test('GEN-01', async ({ page }) => {
    await openGeneralSettings(page);
    await snap(page, 'GEN-01');
  });

  test('GEN-unsaved', async ({ page }) => {
    await openGeneralSettings(page);
    await page.locator(nameInput).fill('renamed-server');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await snap(page, 'GEN-unsaved');
  });

  test('GEN-save-button', async ({ page }) => {
    await openGeneralSettings(page);
    const save = page.locator('[data-testid="server-settings-save-button"]');
    await expect(save).toBeDisabled();
    await snap(page, 'GEN-save-button');
    await page.locator(nameInput).fill('renamed-server');
    await expect(save).toBeEnabled();
    await snap(page, 'GEN-save-button-enabled');
    await openGeneralSettings(page, {
      seed: (state) => {
        state.commandOverrides = { update_server: { delayMs: WAIT_LONG } };
      },
    });
    await page.locator(nameInput).fill('renamed-server');
    await page.locator('[data-testid="server-settings-save-button"]').click();
    await expect(page.locator('[data-testid="server-settings-save-button"]')).toBeDisabled();
    await snap(page, 'GEN-save-button-saving');
  });

  test('GEN-basic-card', async ({ page }) => {
    await openGeneralSettings(page);
    await snapAt(page, page.getByText('Basic Configuration', { exact: true }), 'GEN-basic-card');
  });

  test('GEN-java-select', async ({ page }) => {
    await openGeneralSettings(page);
    await snapAt(
      page,
      page.getByText('System Default (PATH environment)', { exact: true }),
      'GEN-java-select',
    );
    await openGeneralSettings(page, {
      seed: (state) => {
        state.commandOverrides = {
          get_java_versions: {
            response: [
              {
                version: 21,
                path: '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java',
                name: 'Temurin 21',
              },
              {
                version: 17,
                path: '/usr/lib/jvm/java-17/bin/java',
                name: 'OpenJDK 17',
                isCustom: true,
              },
            ],
          },
        };
      },
    });
    await page.getByRole('combobox', { name: 'Java Runtime' }).click();
    await snap(page, 'GEN-java-select-runtimes');
  });

  test('GEN-upgrade-entry', async ({ page }) => {
    await openGeneralSettings(page);
    await snapAt(
      page,
      page.getByRole('button', { name: 'Upgrade Version', exact: true }),
      'GEN-upgrade-entry',
    );
  });

  test('GEN-java-manage', async ({ page }) => {
    await openGeneralSettings(page);
    await snapAt(
      page,
      page.locator('[data-testid="server-settings-java-manage-button"]'),
      'GEN-java-manage',
    );
  });

  test('GEN-jvm-card', async ({ page }) => {
    await openGeneralSettings(page);
    await snapAt(page, page.getByText('JVM Arguments', { exact: true }), 'GEN-jvm-card');
  });

  test('GEN-jvm-preset-active', async ({ page }) => {
    await openGeneralSettings(page);
    await snap(page, 'GEN-jvm-preset-active-none');
    await page.getByRole('button', { name: "Aikar's Flags", exact: true }).click();
    await snap(page, 'GEN-jvm-preset-active');
    await page.getByRole('button', { name: 'ZGC', exact: true }).click();
    await snap(page, 'GEN-jvm-preset-active-zgc');
  });

  test('GEN-restart-card', async ({ page }) => {
    await openGeneralSettings(page);
    await page.locator('[data-testid="auto-restart-toggle"]').click();
    await snapAt(
      page,
      page.getByText('Auto Restart on Crash', { exact: true }),
      'GEN-restart-card',
    );
  });

  test('GEN-restart-disabled', async ({ page }) => {
    await openGeneralSettings(page);
    await expect(page.locator('[data-testid="auto-restart-toggle"]')).not.toBeChecked();
    await snapAt(
      page,
      page.getByText('Auto Restart on Crash', { exact: true }),
      'GEN-restart-disabled',
    );
  });

  test('GEN-backup-card', async ({ page }) => {
    await openGeneralSettings(page);
    await snapAt(page, page.getByText('Auto Backup', { exact: true }), 'GEN-backup-card-off');
    await page.locator('[data-testid="auto-backup-toggle"]').click();
    await snapAt(page, page.getByText('Auto Backup', { exact: true }), 'GEN-backup-card');
  });

  test('GEN-backup-schedule', async ({ page }) => {
    await openGeneralSettings(page);
    await page.locator('[data-testid="auto-backup-toggle"]').click();
    await snap(page, 'GEN-backup-schedule');
    await page.getByRole('combobox', { name: 'Schedule Type' }).click();
    await page.getByRole('option', { name: 'Daily at specified time', exact: true }).click();
    await snap(page, 'GEN-backup-schedule-daily');
    await page.getByRole('combobox', { name: 'Schedule Type' }).click();
    await page.getByRole('option', { name: 'Weekly at specified time', exact: true }).click();
    await snap(page, 'GEN-backup-schedule-weekly');
  });

  test('GEN-notify-card', async ({ page }) => {
    await openGeneralSettings(page);
    await snapAt(page, page.getByText('Notifications', { exact: true }), 'GEN-notify-card');
  });

  test('GEN-notify-threshold', async ({ page }) => {
    await openGeneralSettings(page);
    await page.getByRole('switch', { name: 'Notify on high CPU usage' }).click();
    await expect(page.getByLabel('CPU threshold (%)', { exact: true })).toBeVisible();
    await snap(page, 'GEN-notify-threshold');
  });

  test('GEN-ngrok-card', async ({ page }) => {
    await openGeneralSettings(page);
    await snapAt(page, page.getByText('Public Access (ngrok)', { exact: true }), 'GEN-ngrok-card');
  });

  test('GEN-ngrok-off', async ({ page }) => {
    await openGeneralSettings(page);
    await expect(page.locator('[data-testid="ngrok-toggle"]')).not.toBeChecked();
    await snapAt(page, page.getByText('Public Access (ngrok)', { exact: true }), 'GEN-ngrok-off');
  });

  test('GEN-ngrok-online', async ({ page }) => {
    await openApp(page, { running: true });
    await connectNgrok(page);
    await expect(page.getByText('ONLINE', { exact: true }).first()).toBeVisible();
    await snapAt(
      page,
      page.getByText('Public Address (Share this with friends)', { exact: true }),
      'GEN-ngrok-online',
    );
  });

  test('GEN-ngrok-token-dialog', async ({ page }) => {
    await openGeneralSettings(page);
    await page.locator('[data-testid="ngrok-toggle"]').click();
    await expect(page.locator('[data-testid="ngrok-token-dialog"]')).toBeVisible();
    await snap(page, 'GEN-ngrok-token-dialog');
  });

  test('GEN-ngrok-token-empty', async ({ page }) => {
    await openGeneralSettings(page);
    await page.locator('[data-testid="ngrok-toggle"]').click();
    const dialog = page.locator('[data-testid="ngrok-token-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-testid="ngrok-token-save"]')).toBeDisabled();
    await snap(page, 'GEN-ngrok-token-empty');
    await dialog.locator('[data-testid="ngrok-token-input"]').fill('e2e-token');
    await expect(dialog.locator('[data-testid="ngrok-token-save"]')).toBeEnabled();
    await snap(page, 'GEN-ngrok-token-filled');
  });

  test('GEN-ngrok-guide-button', async ({ page }) => {
    await openGeneralSettings(page);
    await snapAt(
      page,
      page.locator('[data-testid="ngrok-connection-guide-button"]'),
      'GEN-ngrok-guide-button',
    );
  });

  test('GEN-ngrok-change-token', async ({ page }) => {
    await openGeneralSettings(page);
    await page.getByRole('button', { name: 'Change Token', exact: true }).click();
    await expect(page.locator('[data-testid="ngrok-token-dialog"]')).toBeVisible();
    await snap(page, 'GEN-ngrok-change-token');
  });

  test('GEN-world-card', async ({ page }) => {
    await openGeneralSettings(page);
    await snapAt(page, page.getByText('World Management', { exact: true }), 'GEN-world-card');
  });

  test('GEN-world-row', async ({ page }) => {
    await openGeneralSettings(page);
    await snapAt(page, page.getByText('world', { exact: true }).first(), 'GEN-world-row');
  });

  test('GEN-world-hold', async ({ page }) => {
    await openGeneralSettings(page);
    await holdWorldDelete(page, 600);
    await snap(page, 'GEN-world-hold');
    await page.mouse.up();
    await page.waitForTimeout(200);
    await openGeneralSettings(page);
    await holdWorldDelete(page, 1_500);
    await page.mouse.up();
    await expect(page.getByText('Deleted world world', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await snap(page, 'GEN-world-hold-deleted');
  });

  test('GEN-world-blocked', async ({ page }) => {
    await openGeneralSettings(page, { running: true });
    const hold = page.getByRole('button', { name: /Hold to delete/i }).first();
    await expect(hold).toBeDisabled();
    // The disabled button sits under a wrapper that carries the tooltip; hover the wrapper.
    await snapTooltip(
      page,
      page.locator('[data-blocked="true"]').first(),
      'Stop the server to delete a world',
      'GEN-world-blocked',
    );
  });

  test('GEN-world-empty', async ({ page }) => {
    await openGeneralSettings(page, {
      seed: (state) => {
        for (const key of Object.keys(state.files)) {
          if (key === `${SERVER_ROOT}/world` || key.startsWith(`${SERVER_ROOT}/world/`))
            delete state.files[key];
        }
      },
    });
    await expect(page.getByText('No deletable worlds found', { exact: true })).toBeVisible();
    await snap(page, 'GEN-world-empty');
  });

  test('GEN-world-size', async ({ page }) => {
    await openGeneralSettings(page);
    await expect(page.getByText('50 MB', { exact: false }).first()).toBeVisible();
    await snap(page, 'GEN-world-size');
    await openGeneralSettings(page, {
      seed: (state) => {
        state.commandOverrides = { get_managed_directory_size: { delayMs: WAIT_LONG } };
      },
    });
    await expect(page.getByText('…', { exact: true }).first()).toBeVisible();
    await snap(page, 'GEN-world-size-measuring');
    await openGeneralSettings(page, {
      seed: (state) => {
        state.commandOverrides = { get_managed_directory_size: { error: 'E2E size walk failed' } };
      },
    });
    await expect(page.getByText('—', { exact: true }).first()).toBeVisible();
    await snap(page, 'GEN-world-size-failed');
  });

  test('GEN-world-toasts', async ({ page }) => {
    // 1 Deleted world world (success), 2 Failed to delete world (error), 3 Failed to load world list (error)
    await openGeneralSettings(page, { running: false });
    await holdWorldDelete(page, 1_500);
    await page.mouse.up();
    await expect(page.getByText('Deleted world world', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await snap(page, 'GEN-world-toasts-1');

    await openGeneralSettings(page, {
      seed: (state) => {
        state.commandOverrides = { delete_managed_path: { error: 'E2E delete failed' } };
      },
    });
    await holdWorldDelete(page, 1_500);
    await page.mouse.up();
    await expect(page.getByText('Failed to delete world', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await snap(page, 'GEN-world-toasts-2');

    await openGeneralSettings(page, {
      seed: (state) => {
        state.commandOverrides = { list_dir_with_metadata: { error: 'E2E list failed' } };
      },
    });
    await expect(page.getByText('Failed to load world list', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await snap(page, 'GEN-world-toasts-3');
  });

  test('GEN-toasts', async ({ page }) => {
    // Owned by Inventory A (App-level settings toasts). Captured here from the Save Settings flow.
    // 1 Settings saved (success), 2 Failed to save settings (error)
    await openGeneralSettings(page);
    await page.locator(nameInput).fill('renamed-server');
    await page.locator('[data-testid="server-settings-save-button"]').click();
    await expect(page.getByText('Settings saved', { exact: true })).toBeVisible();
    await snap(page, 'GEN-toasts-1');

    await openGeneralSettings(page, {
      seed: (state) => {
        state.commandOverrides = { update_server: { error: 'E2E update failed' } };
      },
    });
    await page.locator(nameInput).fill('renamed-server');
    await page.locator('[data-testid="server-settings-save-button"]').click();
    await expect(page.getByText('Failed to save settings', { exact: true })).toBeVisible();
    await snap(page, 'GEN-toasts-2');
  });

  test('GEN-tooltips', async ({ page }) => {
    // 1 Auto restart: "Automatically restart on abnormal termination"
    // 2 Auto backup: "Create periodic backups"
    // 3 Ngrok: "Allow external connections without port forwarding."
    // 4 JVM: 'Extra JVM flags inserted before -jar. Each flag must start with "-".'
    // 5 World hold (blocked): "Stop the server to delete a world"
    await openGeneralSettings(page);
    await snapTooltip(
      page,
      page.getByRole('button', { name: /Auto Restart on Crash.*More info/ }),
      'Automatically restart on abnormal termination',
      'GEN-tooltips-1',
    );
    await snapTooltip(
      page,
      page.getByRole('button', { name: /Auto Backup.*More info/ }),
      'Create periodic backups',
      'GEN-tooltips-2',
    );
    await snapTooltip(
      page,
      page.getByRole('button', { name: /Public Access.*More info/ }),
      'Allow external connections without port forwarding.',
      'GEN-tooltips-3',
    );
    await snapTooltip(
      page,
      page.getByRole('button', { name: /Custom arguments.*More info/ }),
      'Extra JVM flags inserted before -jar',
      'GEN-tooltips-4',
    );
    await openGeneralSettings(page, { running: true });
    await snapTooltip(
      page,
      page.locator('[data-blocked="true"]').first(),
      'Stop the server to delete a world',
      'GEN-tooltips-5',
    );
  });
});
