import { type Locator, type Page, expect, test } from '@playwright/test';
import {
  SERVER_ID,
  emitEvent,
  openApp,
  recordSkippedA,
  setWindowFlag,
  snap,
  snapAt,
  snapTooltip,
} from './capture-helpers';
import {
  type E2eCommandOverride,
  type E2eScenario,
  type E2eState,
  type E2eUpdaterOption,
  createServerFixture,
} from '../e2e/support/e2e-runtime';

// One test per row of spec/idea/native-swiftui-edition/ui-reference/inventory-a.md (app shell).
// Screenshots land in screens/<ROW-ID>.png. Rows with several texts or toasts use <ROW-ID>-<n>.png, and the
// mapping from n to the text is commented above each group. Extra variants of a state use <ROW-ID>-<variant>.png.
// Rows that cannot be captured are written to screens/_skipped-a.json (see recordSkippedA).

type ShellWindow = Window & {
  __MC_VECTOR_E2E__?: {
    state: E2eState;
    calls: Array<{ kind: string; name: string; args?: unknown }>;
  };
  __dialogSelectedPath?: string | null;
  __globalShortcutHandlers?: Record<string, () => void>;
  __closeRequestedHandler?: (event: { preventDefault: () => void }) => unknown;
};

type Overrides = Record<string, E2eCommandOverride>;

const WAIT_LONG = 60_000;
const SERVER_NAME = 'E2E Server';
const DEFAULT_SCENARIO: E2eScenario = 'paper-plugin-success';
const UPDATE_VERSION = '2.4.0';

const SHORT_NOTES = `## v2.4.0

### Breaking Changes
- **Java 17 is now required** for newly created server profiles.

### Features
- Added a searchable **release notes preview** to the update dialog.

### Bug Fixes
- Fixed stale server status after reconnecting to a stopped server.

### Performance
- Reduced startup work when loading large plugin catalogs.`;

const LONG_NOTES = `## v2.4.0

### Breaking Changes
- **Java 17 is now required** for newly created server profiles.

### Features
${Array.from(
  { length: 30 },
  (_, index) =>
    `- Added feature ${index + 1}: server operators can review the update details before restarting.`,
).join('\n')}

### Bug Fixes
- Fixed stale server status after reconnecting to a stopped server.`;

const PLAIN_NOTES =
  'Plain release text without any headings.\nA second plain line of release notes.';

const VIEW_ROOT: Record<string, string> = {
  dashboard: 'dashboard-view',
  console: 'console-view',
  users: 'users-view',
  files: 'files-view',
  plugins: 'plugin-browser',
  backups: 'backups-view',
  properties: 'properties-view',
  'general-settings': 'server-settings-view',
  proxy: 'proxy-view',
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface ShellOptions {
  /** Mock scenario. Defaults to paper-plugin-success (server-1, Paper, Stopped, EULA accepted). */
  scenario?: E2eScenario;
  /** Starts server-1 before the first load (status Running from mount). */
  running?: boolean;
  /** Opt-in IPC answers, set before the first load. */
  overrides?: Overrides;
  /** Opt-in updater behaviour, set before the first load. */
  updater?: E2eUpdaterOption;
  /** Extra seeding in Node before the app loads. */
  seed?: (state: E2eState) => void;
  /** Header title to wait for. Defaults to the server name, or "Servers" for the default scenario. */
  title?: string;
}

/**
 * Loads the app on the mock. The platform is set to macOS so the update check (plugin-os) reports a supported
 * target; with the linux default it would fail before reaching the updater mock.
 */
async function openShell(page: Page, options: ShellOptions = {}): Promise<void> {
  const scenario = options.scenario ?? DEFAULT_SCENARIO;
  await openApp(page, {
    scenario,
    running: options.running,
    awaitServer: false,
    seed: (state) => {
      state.platform = 'macos';
      if (options.updater) state.updater = options.updater;
      if (options.overrides) state.commandOverrides = { ...options.overrides };
      options.seed?.(state);
    },
  });
  const expected = options.title ?? (scenario === 'default' ? 'Servers' : SERVER_NAME);
  await expect(page.getByTestId('app-main-header')).toContainText(expected, { timeout: 15_000 });
}

async function visible(locator: Locator): Promise<boolean> {
  return locator
    .first()
    .isVisible()
    .catch(() => false);
}

async function openDrawer(page: Page): Promise<void> {
  await page.getByTestId('sidebar-drawer-button').click();
  await expect(page.getByTestId('app-sidebar-drawer')).toBeVisible();
}

/** Opens a nav view from whichever layout is on screen (expanded sidebar, rail, or drawer). */
async function go(page: Page, view: string): Promise<void> {
  const item = page.getByTestId(`nav-item-${view}`);
  const inDrawer = !(await visible(item));
  if (inDrawer) await openDrawer(page);
  await page.getByTestId(`nav-item-${view}`).first().click();
  if (inDrawer) {
    await expect(page.getByTestId('app-sidebar-drawer')).toBeHidden();
  } else {
    await expect(page.getByTestId(`nav-item-${view}`).first()).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
  const root = VIEW_ROOT[view];
  if (root) await expect(page.getByTestId(root)).toBeVisible({ timeout: 15_000 });
}

/** Opens app settings: the brand (expanded), the rail button (collapsed or rail), or the drawer item. */
async function goSettings(page: Page): Promise<void> {
  if (await visible(page.getByTestId('sidebar-brand-button'))) {
    await page.getByTestId('sidebar-brand-button').click();
  } else if (await visible(page.getByTestId('rail-settings-button'))) {
    await page.getByTestId('rail-settings-button').click();
  } else {
    await openDrawer(page);
    await page.getByTestId('nav-item-app-settings').click();
  }
  await expect(page.getByTestId('settings-window')).toBeVisible({ timeout: 15_000 });
}

async function openGeneral(page: Page): Promise<void> {
  await go(page, 'general-settings');
  await expect(page.getByTestId('server-settings-view')).toBeVisible({ timeout: 15_000 });
}

/** Opens the Add Server choice modal from the sidebar button, the rail button, or the content empty state. */
async function startAddServer(page: Page): Promise<void> {
  if (await visible(page.getByTestId('create-server-button'))) {
    await page.getByTestId('create-server-button').first().click();
  } else if (await visible(page.getByTestId('rail-add-server-button'))) {
    await page.getByTestId('rail-add-server-button').click();
  } else {
    await openDrawer(page);
    await page.getByTestId('create-server-button').first().click();
  }
  await expect(page.getByTestId('add-server-choice-modal')).toBeVisible();
}

async function chooseNewServer(page: Page): Promise<void> {
  await startAddServer(page);
  await page.getByTestId('choice-new-server-button').click();
  await page.getByTestId('choice-next-button').click();
  await expect(page.getByTestId('add-server-modal')).toBeVisible();
}

async function chooseImportServer(page: Page): Promise<void> {
  await startAddServer(page);
  await page.getByTestId('choice-import-server-button').click();
  await page.getByTestId('choice-next-button').click();
  await expect(page.getByTestId('import-server-modal')).toBeVisible();
}

interface NewServer {
  name: string;
  profile?: string;
  group?: string;
  software?: string;
}

/** Creates a server through the real Add Server flow (choice, form, create). */
async function createServerUi(page: Page, server: NewServer): Promise<void> {
  const cards = page.locator('[data-testid^="server-card-"]');
  const before = await cards.count();
  await chooseNewServer(page);
  const modal = page.getByTestId('add-server-modal');
  await modal.getByTestId('server-name-input').fill(server.name);
  // The form keeps its values after a successful create (inventory section 7), so the optional fields are always
  // written, empty when unused. Otherwise the next server inherits the previous group.
  await modal.getByLabel('Profile Name', { exact: true }).fill(server.profile ?? '');
  await modal.getByLabel('Group Name', { exact: true }).fill(server.group ?? '');
  if (server.software) {
    await modal.getByTestId('server-software-select').click();
    await page.getByRole('option', { name: new RegExp(`^${server.software}\\b`) }).click();
  }
  await modal.getByTestId('save-server-button').click();
  await expect(modal).toHaveCount(0, { timeout: 15_000 });
  await expect(cards).toHaveCount(before + 1, { timeout: 15_000 });
}

async function openServerMenu(page: Page, serverId = SERVER_ID): Promise<void> {
  await page.getByTestId(`server-card-${serverId}`).click({ button: 'right' });
  await expect(page.getByRole('menu', { name: /actions$/ })).toBeVisible();
}

async function confirmDialog(page: Page): Promise<void> {
  await expect(page.getByTestId('feedback-dialog')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('feedback-confirm-confirm').click();
}

async function expectText(page: Page, text: string, timeout = 15_000): Promise<void> {
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible({ timeout });
}

/**
 * A fresh page in the same context, for a state that needs different seeds. Each openShell call adds an init
 * script to its page, so one page per seeded state keeps the states from leaking into each other.
 */
async function variantPage(page: Page): Promise<Page> {
  return page.context().newPage();
}

async function setDialogPath(page: Page, value: string | null): Promise<void> {
  await page.evaluate((next) => {
    (window as ShellWindow).__dialogSelectedPath = next;
  }, value);
}

async function latestIpcArgs(page: Page, name: string): Promise<Record<string, unknown>> {
  return page.evaluate((command) => {
    const calls = (window as ShellWindow).__MC_VECTOR_E2E__?.calls ?? [];
    const matches = calls.filter((call) => call.kind === 'ipc' && call.name === command);
    const last = matches[matches.length - 1]?.args;
    return typeof last === 'object' && last !== null ? (last as Record<string, unknown>) : {};
  }, name);
}

/** Starts a server-creation progress event for the operation the app just started (M8). */
async function emitCreationProgress(page: Page, progress: number): Promise<void> {
  await expect
    .poll(async () => {
      const args = await latestIpcArgs(page, 'create_server_profile');
      const request = (args.request ?? args) as Record<string, unknown>;
      return typeof request.operationId === 'string' ? request.operationId : '';
    })
    .not.toBe('');
  const args = await latestIpcArgs(page, 'create_server_profile');
  const request = (args.request ?? args) as Record<string, unknown>;
  await emitEvent(page, 'server-creation-download-progress', {
    operationId: request.operationId,
    progress,
  });
}

async function emitAutomation(
  page: Page,
  event: Record<string, unknown> & { kind: string },
): Promise<void> {
  await emitEvent(page, 'server-automation-event', {
    serverId: SERVER_ID,
    serverName: SERVER_NAME,
    ...event,
  });
}

/** A server row as the get_servers IPC returns it, with optional extra fields. */
function serverPayload(extra: Record<string, unknown> = {}) {
  return [{ ...createServerFixture(SERVER_ID), status: 'offline', ...extra }];
}

// Mapped rows shown in both the rail and the drawer.
const NAV_ITEMS: Array<[id: string, view: string, label: string]> = [
  ['NAV-dashboard', 'dashboard', 'Dashboard'],
  ['NAV-console', 'console', 'Console'],
  ['NAV-users', 'users', 'Users'],
  ['NAV-files', 'files', 'Files'],
  ['NAV-plugins', 'plugins', 'Plugins / Mods'],
  ['NAV-backups', 'backups', 'Backups'],
  ['NAV-properties', 'properties', 'Properties'],
  ['NAV-general-settings', 'general-settings', 'General Settings'],
];

// ---------------------------------------------------------------------------
// Sidebar and layout
// ---------------------------------------------------------------------------

test.describe('Sidebar and layout', () => {
  test('SHELL-ROOT', async ({ page }) => {
    await openShell(page);
    await snap(page, 'SHELL-ROOT');
  });

  test('SHELL-LAYOUT-wide', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('app-sidebar')).toHaveClass(/app-sidebar--open/);
    await snap(page, 'SHELL-LAYOUT-wide');
  });

  test('SHELL-LAYOUT-collapsed', async ({ page }) => {
    await openShell(page);
    await page.getByTestId('sidebar-toggle-button').click();
    await expect(page.getByTestId('app-sidebar')).toHaveClass(/app-sidebar--collapsed/);
    await snap(page, 'SHELL-LAYOUT-collapsed');
  });

  test('SHELL-MAIN', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await expect(page.getByTestId('app-main')).toBeVisible();
    await snap(page, 'SHELL-MAIN');
  });

  test('SHELL-SIDEBAR', async ({ page }) => {
    await openShell(page);
    await snapAt(page, page.getByTestId('app-sidebar'), 'SHELL-SIDEBAR');
  });

  test('SHELL-HEADER', async ({ page }) => {
    await openShell(page);
    await snap(page, 'SHELL-HEADER');
  });

  test('SHELL-HEADER-brand', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('sidebar-brand-button')).toHaveText('MC-Vector');
    await page.getByTestId('sidebar-brand-button').hover();
    await snap(page, 'SHELL-HEADER-brand');
  });

  test('SHELL-HEADER-toggle-collapse', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('sidebar-toggle-button')).toHaveAttribute(
      'aria-label',
      'Collapse sidebar',
    );
    await snap(page, 'SHELL-HEADER-toggle-collapse');
  });

  test('SHELL-HEADER-toggle-expand', async ({ page }) => {
    await openShell(page);
    await page.getByTestId('sidebar-toggle-button').click();
    await expect(page.getByTestId('sidebar-toggle-button')).toHaveAttribute(
      'aria-label',
      'Expand sidebar',
    );
    await snap(page, 'SHELL-HEADER-toggle-expand');
  });

  test('SHELL-NAV', async ({ page }) => {
    await openShell(page);
    await snapAt(page, page.getByTestId('app-sidebar-nav'), 'SHELL-NAV');
  });

  for (const [id, view] of NAV_ITEMS) {
    test(id, async ({ page }) => {
      await openShell(page);
      await go(page, view);
      await snap(page, id);
    });
  }

  test('NAV-proxy', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await go(page, 'proxy');
    await snap(page, 'NAV-proxy');
  });

  test('NAV-item-active-idle', async ({ page }) => {
    await openShell(page);
    await go(page, 'dashboard');
    await go(page, 'console');
    await expect(page.getByTestId('nav-item-console')).toHaveClass(/is-active/);
    await expect(page.getByTestId('nav-item-dashboard')).toHaveClass(/is-idle/);
    await snap(page, 'NAV-item-active-idle');
  });

  test('SERVERPANEL', async ({ page }) => {
    await openShell(page);
    await snapAt(page, page.getByTestId('server-list'), 'SERVERPANEL');
  });

  test('SERVERPANEL-title-row', async ({ page }) => {
    await openShell(page);
    await expect(
      page.getByTestId('server-list').getByRole('button', { name: 'Select', exact: true }),
    ).toBeVisible();
    await snap(page, 'SERVERPANEL-title-row');
    // Variant: no servers, so the title row has no Select toggle.
    const empty = await variantPage(page);
    await openShell(empty, { scenario: 'default' });
    await snap(empty, 'SERVERPANEL-title-row-empty');
  });

  test('SERVERPANEL-bulk-toggle', async ({ page }) => {
    await openShell(page);
    const toggle = page.getByTestId('server-list').getByRole('button', {
      name: 'Select',
      exact: true,
    });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await snap(page, 'SERVERPANEL-bulk-toggle');
  });

  test('SERVERPANEL-group', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await createServerUi(page, { name: 'alpha-prod', group: 'Production' });
    await createServerUi(page, { name: 'beta-free' });
    await expect(
      page.getByTestId('server-list').getByText('Production', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId('server-list').getByText('Ungrouped', { exact: true }),
    ).toBeVisible();
    await snapAt(page, page.getByTestId('server-list'), 'SERVERPANEL-group');
  });

  test('SERVERPANEL-row', async ({ page }) => {
    await openShell(page);
    await snapAt(page, page.getByTestId(`server-card-${SERVER_ID}`), 'SERVERPANEL-row');
  });

  test('SERVERPANEL-row-selected', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId(`server-card-${SERVER_ID}`)).toHaveAttribute(
      'aria-current',
      'true',
    );
    await snapAt(page, page.getByTestId(`server-card-${SERVER_ID}`), 'SERVERPANEL-row-selected');
  });

  test('SERVERPANEL-row-unavailable', async ({ page }) => {
    // get_servers answers with a row that carries unavailableReason (the backend sets it; the mock does not).
    await openShell(page, {
      overrides: {
        get_servers: { response: serverPayload({ unavailableReason: 'Server folder is missing' }) },
      },
    });
    await expect(page.getByText('Server folder is missing', { exact: true })).toBeVisible();
    await snapAt(page, page.getByTestId('server-list'), 'SERVERPANEL-row-unavailable');
  });

  test('SERVERPANEL-row-profile', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await createServerUi(page, { name: 'profiled-e2e', profile: 'Survival' });
    await expect(
      page.getByTestId('server-list').getByText('Survival', { exact: true }),
    ).toBeVisible();
    await snapAt(page, page.getByTestId('server-list'), 'SERVERPANEL-row-profile');
  });

  test('SERVERPANEL-status-labels', async ({ page }) => {
    // Stopped is the default; the rest use the server-status-change event (M2), which the mock never sends.
    await openShell(page);
    await snapAt(page, page.getByTestId('server-list'), 'SERVERPANEL-status-labels');

    const running = await variantPage(page);
    await openShell(running, { running: true });
    await expect(
      running.getByTestId(`server-card-${SERVER_ID}`).locator('[data-status="online"]'),
    ).toBeVisible();
    await snapAt(running, running.getByTestId('server-list'), 'SERVERPANEL-status-labels-running');

    for (const status of ['starting', 'stopping', 'restarting', 'crashed'] as const) {
      const variant = await variantPage(page);
      await openShell(variant);
      await emitEvent(variant, 'server-status-change', { serverId: SERVER_ID, status });
      await expect(
        variant.getByTestId(`server-card-${SERVER_ID}`).locator(`[data-status="${status}"]`),
      ).toBeVisible();
      await snapAt(
        variant,
        variant.getByTestId('server-list'),
        `SERVERPANEL-status-labels-${status}`,
      );
    }
  });

  test('SERVERPANEL-bulk-mode', async ({ page }) => {
    await openShell(page);
    await page
      .getByTestId('server-list')
      .getByRole('button', { name: 'Select', exact: true })
      .click();
    await snapAt(page, page.getByTestId('server-list'), 'SERVERPANEL-bulk-mode');
  });

  test('SERVERPANEL-bulk-bar', async ({ page }) => {
    await openShell(page);
    await page
      .getByTestId('server-list')
      .getByRole('button', { name: 'Select', exact: true })
      .click();
    await page.getByTestId(`server-card-${SERVER_ID}`).click();
    await expect(page.getByTestId('bulk-start-button')).toBeVisible();
    await snapAt(page, page.getByTestId('server-list'), 'SERVERPANEL-bulk-bar');
  });

  test('SERVERPANEL-bulk-running', async ({ page }) => {
    // A bulk Backup held by the mock keeps isBulkRunning set, so Start, Stop and Backup stay disabled.
    await openShell(page, { overrides: { create_managed_backup: { delayMs: WAIT_LONG } } });
    await page
      .getByTestId('server-list')
      .getByRole('button', { name: 'Select', exact: true })
      .click();
    await page.getByTestId(`server-card-${SERVER_ID}`).click();
    await page
      .getByTestId('server-list')
      .getByRole('button', { name: 'Backup', exact: true })
      .click();
    await expect(page.getByTestId('bulk-start-button')).toBeDisabled();
    await snapAt(page, page.getByTestId('server-list'), 'SERVERPANEL-bulk-running');
  });

  test('SERVERPANEL-add-row', async ({ page }) => {
    await openShell(page);
    await snapAt(page, page.getByTestId('create-server-button'), 'SERVERPANEL-add-row');
  });

  test('SERVERPANEL-empty', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await snapAt(page, page.getByTestId('sidebar-empty-hint'), 'SERVERPANEL-empty');
  });

  test('CTXMENU-server', async ({ page }) => {
    await openShell(page);
    await openServerMenu(page);
    await snap(page, 'CTXMENU-server');
  });

  test('CTXMENU-server-clone', async ({ page }) => {
    await openShell(page);
    await openServerMenu(page);
    await page.getByRole('menuitem', { name: 'Clone', exact: true }).hover();
    await snap(page, 'CTXMENU-server-clone');
  });

  test('CTXMENU-server-template', async ({ page }) => {
    await openShell(page);
    await openServerMenu(page);
    await page.getByRole('menuitem', { name: 'Save as Template', exact: true }).hover();
    await snap(page, 'CTXMENU-server-template');
  });

  test('CTXMENU-server-delete', async ({ page }) => {
    await openShell(page);
    await openServerMenu(page);
    await page.getByTestId(`delete-server-${SERVER_ID}`).hover();
    await snap(page, 'CTXMENU-server-delete');
  });
});

// ---------------------------------------------------------------------------
// Narrow window: rail (below 1024px) and drawer (below 768px)
// ---------------------------------------------------------------------------

test.describe('Rail layout (1000 px)', () => {
  test.use({ viewport: { width: 1000, height: 800 } });

  test('SHELL-LAYOUT-rail-forced', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('app-sidebar')).toHaveClass(/app-sidebar--collapsed/);
    await snap(page, 'SHELL-LAYOUT-rail-forced');
  });

  test('SHELL-HEADER-no-toggle', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('sidebar-toggle-button')).toHaveCount(0);
    await snap(page, 'SHELL-HEADER-no-toggle');
  });

  test('NAV-item-rail', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('nav-item-dashboard')).toHaveAttribute('aria-label', 'Dashboard');
    await snapAt(page, page.getByTestId('app-sidebar-nav'), 'NAV-item-rail');
  });

  test('RAIL', async ({ page }) => {
    await openShell(page);
    await snapAt(page, page.getByTestId('sidebar-rail-actions'), 'RAIL');
  });

  test('RAIL-switcher', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('rail-server-switcher').locator('[data-status]')).toBeVisible();
    await snapAt(page, page.getByTestId('sidebar-rail-actions'), 'RAIL-switcher');
  });

  test('RAIL-switcher-popover', async ({ page }) => {
    await openShell(page);
    await page.getByTestId('rail-server-switcher').click();
    await expect(page.getByText('Switch server', { exact: true }).first()).toBeVisible();
    await snap(page, 'RAIL-switcher-popover');
  });

  test('RAIL-switcher-empty', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await page.getByTestId('rail-server-switcher').click();
    await expect(page.getByText('No servers yet', { exact: true }).first()).toBeVisible();
    await snap(page, 'RAIL-switcher-empty');
  });

  test('RAIL-add', async ({ page }) => {
    await openShell(page);
    await page.getByTestId('rail-add-server-button').click();
    await expect(page.getByTestId('add-server-choice-modal')).toBeVisible();
    await snap(page, 'RAIL-add');
  });

  test('RAIL-settings', async ({ page }) => {
    await openShell(page);
    await page.getByTestId('rail-settings-button').click();
    await expect(page.getByTestId('settings-window')).toBeVisible();
    await snap(page, 'RAIL-settings');
  });

  test('TOOLTIP-nav-rail', async ({ page }) => {
    // Group TOOLTIP-nav-rail, one PNG per rail item in nav order:
    // 1 Dashboard, 2 Console, 3 Users, 4 Files, 5 Plugins / Mods, 6 Backups, 7 Properties,
    // 8 General Settings, 9 Proxy Network.
    await openShell(page);
    const items: Array<[view: string, label: string]> = [
      ...NAV_ITEMS.map(([, view, label]) => [view, label] as [string, string]),
      ['proxy', 'Proxy Network'],
    ];
    for (const [index, [view, label]] of items.entries()) {
      await snapTooltip(
        page,
        page.getByTestId(`nav-item-${view}`),
        label,
        `TOOLTIP-nav-rail-${index + 1}`,
      );
    }
  });
});

test.describe('Drawer layout (700 px)', () => {
  test.use({ viewport: { width: 700, height: 800 } });

  test('SHELL-LAYOUT-drawer', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
    await snap(page, 'SHELL-LAYOUT-drawer');
  });

  test('MAIN-HEADER-menu', async ({ page }) => {
    await openShell(page);
    await snap(page, 'MAIN-HEADER-menu');
  });

  test('DRAWER-navigation', async ({ page }) => {
    await openShell(page);
    await openDrawer(page);
    await snap(page, 'DRAWER-navigation');
  });

  test('DRAWER-closed', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('app-sidebar-drawer')).toHaveCount(0);
    await snap(page, 'DRAWER-closed');
  });

  test('NAV-app-settings', async ({ page }) => {
    await openShell(page);
    await openDrawer(page);
    await expect(page.getByTestId('nav-item-app-settings')).toBeVisible();
    await snap(page, 'NAV-app-settings');
  });

  test('TOOLTIP-header-4', async ({ page }) => {
    // Group TOOLTIP-header: 4 = the drawer menu button (below 768px). 1-3 are in the compact (880 px) block.
    await openShell(page);
    await snapTooltip(
      page,
      page.getByTestId('sidebar-drawer-button'),
      'Open menu',
      'TOOLTIP-header-4',
    );
  });
});

// ---------------------------------------------------------------------------
// Main header and content
// ---------------------------------------------------------------------------

test.describe('Main header and content', () => {
  test('MAIN-HEADER', async ({ page }) => {
    await openShell(page);
    await snap(page, 'MAIN-HEADER');
  });

  test('MAIN-HEADER-title-server', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('app-main-header').locator('h2')).toHaveText(SERVER_NAME);
    await snap(page, 'MAIN-HEADER-title-server');
  });

  test('MAIN-HEADER-subtitle', async ({ page }) => {
    await openShell(page);
    await go(page, 'console');
    await expect(page.getByTestId('app-main-header')).toContainText('E2E Server / Console');
    await snap(page, 'MAIN-HEADER-subtitle');
  });

  test('MAIN-HEADER-title-static', async ({ page }) => {
    await openShell(page);
    await go(page, 'proxy');
    await expect(page.getByTestId('app-main-header').locator('h2')).toHaveText('Proxy Network');
    await snap(page, 'MAIN-HEADER-title-static');
  });

  test('MAIN-HEADER-actions-hidden', async ({ page }) => {
    await openShell(page);
    await goSettings(page);
    await expect(page.getByTestId('server-start-button')).toHaveCount(0);
    await snap(page, 'MAIN-HEADER-actions-hidden');
  });

  test('MAIN-HEADER-start', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('server-start-button')).toBeEnabled();
    await snap(page, 'MAIN-HEADER-start');
  });

  test('MAIN-HEADER-restart', async ({ page }) => {
    await openShell(page, { running: true });
    await expect(page.getByTestId('server-restart-button')).toBeEnabled();
    await snap(page, 'MAIN-HEADER-restart');
  });

  test('MAIN-HEADER-stop', async ({ page }) => {
    await openShell(page, { running: true });
    await expect(page.getByTestId('server-stop-button')).toBeEnabled();
    await snap(page, 'MAIN-HEADER-stop');
  });

  test('MAIN-HEADER-action-matrix', async ({ page }) => {
    // Offline matrix: Start enabled, Restart and Stop disabled.
    await openShell(page);
    await expect(page.getByTestId('server-restart-button')).toBeDisabled();
    await snap(page, 'MAIN-HEADER-action-matrix');

    // Online matrix: Restart and Stop enabled, Start disabled.
    const online = await variantPage(page);
    await openShell(online, { running: true });
    await expect(online.getByTestId('server-start-button')).toBeDisabled();
    await snap(online, 'MAIN-HEADER-action-matrix-online');

    // No server selected: every action disabled.
    const none = await variantPage(page);
    await openShell(none, { scenario: 'default' });
    await expect(none.getByTestId('server-start-button')).toBeDisabled();
    await snap(none, 'MAIN-HEADER-action-matrix-no-server');

    // Transient statuses come from the server-status-change event (M2). Crashed re-enables Start.
    for (const status of ['starting', 'stopping', 'restarting', 'crashed'] as const) {
      const variant = await variantPage(page);
      await openShell(variant);
      await emitEvent(variant, 'server-status-change', { serverId: SERVER_ID, status });
      await expect(variant.getByTestId('server-restart-button')).toBeDisabled();
      await expect(variant.getByTestId('server-stop-button')).toBeDisabled();
      if (status === 'crashed') {
        await expect(variant.getByTestId('server-start-button')).toBeEnabled();
      } else {
        await expect(variant.getByTestId('server-start-button')).toBeDisabled();
      }
      await snap(variant, `MAIN-HEADER-action-matrix-${status}`);
    }
  });

  test('MAIN-HEADER-compact', async ({ page }) => {
    await page.setViewportSize({ width: 880, height: 800 });
    await openShell(page, { running: true });
    await expect(page.getByTestId('server-stop-button')).toHaveAttribute('aria-label', 'Stop');
    await snap(page, 'MAIN-HEADER-compact');
  });

  test('MAIN-CONTENT', async ({ page }) => {
    await openShell(page);
    await snapAt(page, page.getByTestId('app-main-content'), 'MAIN-CONTENT');
  });

  test('MAIN-CONTENT-suspense', async ({ page }) => {
    // The Settings chunk is lazy. Holding its module request keeps the Suspense fallback on screen.
    await openShell(page);
    await page.route(/SettingsWindow\.tsx/, () => {
      // Never answered: the lazy import stays pending for the capture.
    });
    await page.getByTestId('sidebar-brand-button').click();
    // The fallback skeleton labels itself through a role=status accessible name.
    await expect(page.getByRole('status', { name: 'Loading view...' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('settings-window')).toHaveCount(0);
    await snap(page, 'MAIN-CONTENT-suspense');
  });

  test('MAIN-CONTENT-error', async ({ page }) => {
    // A server whose version is an object makes DashboardView throw while rendering, which the view boundary catches.
    await openShell(page, {
      overrides: { get_servers: { response: serverPayload({ version: { major: 1 } }) } },
    });
    await expect(page.getByText('An error occurred', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await snap(page, 'MAIN-CONTENT-error');
  });

  test('CONTENT-noserver-empty', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    // No dashboard-view renders without a server, so the nav click is not followed by a view root wait.
    await page.getByTestId('nav-item-dashboard').click();
    await expect(page.getByTestId('content-state')).toContainText('No servers yet');
    await snap(page, 'CONTENT-noserver-empty');
  });

  test('CONTENT-noserver-select', async () => {
    recordSkippedA(
      'CONTENT-noserver-select',
      'Code path only: AppContentRouter shows "Select a server or create one." when servers exist but none is selected. App.tsx selects the first server on load and after a delete, and no mock or UI path leaves a non-empty list without a selection (src/renderer/hooks/use-server-runtime-listeners.ts sets the first server after get_servers).',
    );
  });

  test('CONTENT-notfound', async () => {
    recordSkippedA(
      'CONTENT-notfound',
      'Unreachable in the app: the "Not found" branch renders only for a view id missing from the static and server maps (AppContentRouter.tsx:136). The router is only fed valid AppView ids, and the UI Lab that could widen them is dev-only and excluded from this inventory.',
    );
  });

  test('STATE-EmptyLine', async ({ page }) => {
    // EmptyLine is the muted centred line used by ContentState; the Proxy backend list shows the same primitive.
    await openShell(page, { scenario: 'default' });
    await go(page, 'proxy');
    await expect(page.getByText('No available backend servers', { exact: true })).toBeVisible();
    await snap(page, 'STATE-EmptyLine');
  });

  test('STATE-InlineError', async () => {
    recordSkippedA(
      'STATE-InlineError',
      'Dead code: InlineError.tsx has no call site under src/ (inventory section 4 and 6). It is not rendered anywhere, so there is no state to capture. Do not port unless a caller is added.',
    );
  });
});

// ---------------------------------------------------------------------------
// Settings window
// ---------------------------------------------------------------------------

test.describe('Settings window', () => {
  test('SETTINGS-root', async ({ page }) => {
    await openShell(page);
    await goSettings(page);
    await snap(page, 'SETTINGS-root');
  });

  test('SETTINGS-back', async ({ page }) => {
    await openShell(page);
    await go(page, 'properties');
    await goSettings(page);
    await page.getByTestId('settings-back-button').hover();
    await snap(page, 'SETTINGS-back');
    await page.getByTestId('settings-back-button').click();
    await expect(page.getByTestId('properties-view')).toBeVisible();
    await snap(page, 'SETTINGS-back-after');
  });

  test('SETTINGS-updates', async ({ page }) => {
    await openShell(page);
    await goSettings(page);
    await snapAt(page, page.getByText('Updates', { exact: true }).first(), 'SETTINGS-updates');
  });

  test('SETTINGS-updates-check', async ({ page }) => {
    await openShell(page);
    await goSettings(page);
    await page.getByTestId('update-check-button').click();
    await expect(page.getByTestId('update-status')).toHaveText('You are up to date.');
    await snap(page, 'SETTINGS-updates-check');
  });

  test('SETTINGS-updates-status-idle', async () => {
    recordSkippedA(
      'SETTINGS-updates-status-idle',
      'The idle status ("Not checked yet.") is only the initial React state. The mount effect in use-app-updater.ts sets "checking" in the same tick, so no frame paints idle and no screenshot can reach it.',
    );
  });

  test('SETTINGS-updates-status-checking', async ({ page }) => {
    // The mount check is held, so the checking status stays on screen while Settings is open.
    await openShell(page, { updater: { checkDelayMs: WAIT_LONG } });
    await goSettings(page);
    await expect(page.getByTestId('update-status')).toContainText('Checking for updates');
    await snap(page, 'SETTINGS-updates-status-checking');
  });

  test('SETTINGS-updates-status-available', async ({ page }) => {
    await openShell(page, { updater: { version: UPDATE_VERSION, body: SHORT_NOTES } });
    await expect(page.getByTestId('app-update-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Later', exact: true }).click();
    await expect(page.getByTestId('app-update-modal')).toBeHidden();
    await goSettings(page);
    await expect(page.getByTestId('update-status-version')).toHaveText(
      `Update available! v${UPDATE_VERSION}`,
    );
    await snap(page, 'SETTINGS-updates-status-available');
  });

  test('SETTINGS-updates-status-not-available', async ({ page }) => {
    await openShell(page);
    await goSettings(page);
    await expect(page.getByTestId('update-status')).toHaveText('You are up to date.');
    await snap(page, 'SETTINGS-updates-status-not-available');
  });

  test('SETTINGS-updates-status-error', async ({ page }) => {
    await openShell(page, { updater: { checkError: 'Error: Network unreachable' } });
    await goSettings(page);
    await expect(page.getByText('Could not check for updates', { exact: true })).toBeVisible();
    await snap(page, 'SETTINGS-updates-status-error');
  });

  test('SETTINGS-channel-select', async ({ page }) => {
    await openShell(page);
    await goSettings(page);
    await expect(page.getByTestId('update-channel-select')).toContainText('Stable releases');
    await snap(page, 'SETTINGS-channel-select');
    await page.getByTestId('update-channel-select').click();
    await expect(page.getByRole('option', { name: 'Beta releases', exact: true })).toBeVisible();
    await snap(page, 'SETTINGS-channel-select-open');
    await page.getByRole('option', { name: 'Beta releases', exact: true }).click();
    await expect(page.getByTestId('update-channel-select')).toContainText('Beta releases');
    await snap(page, 'SETTINGS-channel-select-beta');
  });

  test('SETTINGS-channel-error', async ({ page }) => {
    await openShell(page, {
      seed: (state) => {
        state.config.__storeSaveError = true;
      },
    });
    await goSettings(page);
    await page.getByTestId('update-channel-select').click();
    await page.getByRole('option', { name: 'Beta releases', exact: true }).click();
    await expectText(
      page,
      'The update channel could not be saved. The previous selection was restored.',
    );
    await snap(page, 'SETTINGS-channel-error');
  });

  test('SETTINGS-language', async ({ page }) => {
    await openShell(page);
    await goSettings(page);
    await page.locator('#language-select').click();
    await expect(page.getByRole('option', { name: 'English' }).first()).toBeVisible();
    await snap(page, 'SETTINGS-language');
  });

  test('SETTINGS-security', async ({ page }) => {
    await openShell(page);
    await goSettings(page);
    await expect(page.locator('#allow-unverified-plugin-downloads')).not.toBeChecked();
    await snapAt(page, page.getByTestId('settings-window'), 'SETTINGS-security');
  });

  test('SETTINGS-security-switch', async ({ page }) => {
    await openShell(page);
    await goSettings(page);
    await page.locator('#allow-unverified-plugin-downloads').click();
    await expect(page.locator('#allow-unverified-plugin-downloads')).toBeChecked();
    await snap(page, 'SETTINGS-security-switch');
  });

  test('SETTINGS-security-saving', async ({ page }) => {
    await openShell(page, {
      overrides: { set_allow_unverified_plugin_downloads: { delayMs: WAIT_LONG } },
    });
    await goSettings(page);
    await page.locator('#allow-unverified-plugin-downloads').click();
    await expect(page.getByText('Saving security setting...', { exact: true })).toBeVisible();
    await snap(page, 'SETTINGS-security-saving');
  });

  test('SETTINGS-security-error', async ({ page }) => {
    await openShell(page, {
      overrides: { set_allow_unverified_plugin_downloads: { error: 'E2E security save failed' } },
    });
    await goSettings(page);
    await page.locator('#allow-unverified-plugin-downloads').click();
    await expectText(page, 'This setting could not be saved. The change was reverted.');
    await expect(page.locator('#allow-unverified-plugin-downloads')).not.toBeChecked();
    await snap(page, 'SETTINGS-security-error');
  });

  test('SETTINGS-glass', async ({ page }) => {
    await openShell(page);
    await goSettings(page);
    await snapAt(
      page,
      page.getByText('Liquid Glass (Experimental)', { exact: true }),
      'SETTINGS-glass',
    );
    await page.locator('#liquid-glass-toggle').click();
    await expect(page.locator('#liquid-glass-toggle')).toBeChecked();
    await snap(page, 'SETTINGS-glass-on');
  });
});

// ---------------------------------------------------------------------------
// Command palette
// ---------------------------------------------------------------------------

async function openPalette(page: Page): Promise<void> {
  // The palette compares event.key with a lowercase "k" (CommandPalette.tsx), so the key must not be uppercase.
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder('Search commands...')).toBeVisible();
}

test.describe('Command palette', () => {
  test('CMDK-open', async ({ page }) => {
    await openShell(page);
    await openPalette(page);
    await snap(page, 'CMDK-open');
  });

  test('CMDK-group-navigate', async ({ page }) => {
    await openShell(page);
    await openPalette(page);
    await expect(page.getByRole('group', { name: 'Navigate', exact: true })).toBeVisible();
    await snap(page, 'CMDK-group-navigate');
  });

  test('CMDK-group-server-actions', async ({ page }) => {
    // Offline: Start. Online (variant): Stop and Restart.
    await openShell(page);
    await openPalette(page);
    await expect(page.getByRole('group', { name: 'Server Actions', exact: true })).toBeVisible();
    await snap(page, 'CMDK-group-server-actions');
    const online = await variantPage(page);
    await openShell(online, { running: true });
    await openPalette(online);
    await expect(online.getByRole('group', { name: 'Server Actions', exact: true })).toBeVisible();
    await snap(online, 'CMDK-group-server-actions-online');
  });

  test('CMDK-group-servers', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await openPalette(page);
    await expect(page.getByRole('group', { name: 'Servers', exact: true })).toBeVisible();
    await snap(page, 'CMDK-group-servers');
  });

  test('CMDK-state-filtered', async ({ page }) => {
    await openShell(page);
    await openPalette(page);
    await page.getByPlaceholder('Search commands...').fill('proxy');
    await expect(page.getByRole('option', { name: /Proxy Network/ }).first()).toBeVisible();
    await snap(page, 'CMDK-state-filtered');
  });

  test('CMDK-state-empty', async ({ page }) => {
    await openShell(page);
    await openPalette(page);
    await page.getByPlaceholder('Search commands...').fill('zzzz');
    await expect(page.getByText(/No results for/).first()).toBeVisible();
    await snap(page, 'CMDK-state-empty');
  });

  test('CMDK-state-clear', async ({ page }) => {
    await openShell(page);
    await openPalette(page);
    const input = page.getByPlaceholder('Search commands...');
    await input.fill('a');
    await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toBeVisible();
    await snap(page, 'CMDK-state-clear');
    // The first Escape clears the query, the second closes the palette.
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('');
    await snap(page, 'CMDK-state-clear-cleared');
    await page.keyboard.press('Escape');
    await expect(input).toBeHidden();
    await snap(page, 'CMDK-state-clear-closed');
  });
});

// ---------------------------------------------------------------------------
// Add server: choice modal and form
// ---------------------------------------------------------------------------

test.describe('Add server choice', () => {
  test('ADD-CHOICE-01', async ({ page }) => {
    // Opened from the empty-state button in the content area (no servers yet).
    await openShell(page, { scenario: 'default' });
    await startAddServer(page);
    await snap(page, 'ADD-CHOICE-01');
  });

  test('ADD-CHOICE-state-none', async ({ page }) => {
    await openShell(page);
    await startAddServer(page);
    await expect(page.getByTestId('choice-next-button')).toBeDisabled();
    await snap(page, 'ADD-CHOICE-state-none');
  });

  test('ADD-CHOICE-state-new', async ({ page }) => {
    await openShell(page);
    await startAddServer(page);
    await page.getByTestId('choice-new-server-button').click();
    await expect(page.getByTestId('choice-next-button')).toBeEnabled();
    await snap(page, 'ADD-CHOICE-state-new');
  });

  test('ADD-CHOICE-state-import', async ({ page }) => {
    await openShell(page);
    await startAddServer(page);
    await page.getByTestId('choice-import-server-button').click();
    await expect(page.getByTestId('choice-next-button')).toBeEnabled();
    await snap(page, 'ADD-CHOICE-state-import');
  });
});

test.describe('Add server form', () => {
  test('ADD-SERVER-01', async ({ page }) => {
    await openShell(page);
    await chooseNewServer(page);
    await snap(page, 'ADD-SERVER-01');
  });

  test('ADD-SERVER-02-name-required', async ({ page }) => {
    await openShell(page);
    await chooseNewServer(page);
    await page.getByTestId('save-server-button').click();
    await expectText(page, 'Enter a server name.');
    await snap(page, 'ADD-SERVER-02-name-required');
  });

  test('ADD-SERVER-03-name-invalid', async ({ page }) => {
    await openShell(page);
    await chooseNewServer(page);
    await page.getByTestId('server-name-input').fill('my server');
    await page.getByTestId('save-server-button').click();
    await expectText(page, 'Only letters, numbers, hyphens, and underscores are allowed.');
    await snap(page, 'ADD-SERVER-03-name-invalid');
  });

  // FINDING: the Arc NumberField clamps a typed value to min/max when it commits (blur, Enter, or Save's click
  // moves focus away; number-field.tsx commitDraft -> commitValue -> clamp). So the form never holds 70000 or 0,
  // and the zod message "Port must be between 1 and 65535." can not show through the UI. The screenshot shows the
  // reachable invalid state instead: the field's own over-limit warning while the bad value is still being typed.
  test('ADD-SERVER-04-port-invalid', async ({ page }) => {
    await openShell(page);
    await chooseNewServer(page);
    await page.getByTestId('server-name-input').fill('e2e-port');
    await page.getByTestId('server-port-input').fill('70000');
    await page.getByTestId('server-port-input').focus();
    await snap(page, 'ADD-SERVER-04-port-invalid');
  });

  test('ADD-SERVER-05-memory-invalid', async ({ page }) => {
    await openShell(page);
    await chooseNewServer(page);
    await page.getByTestId('server-name-input').fill('e2e-memory');
    await page.getByTestId('server-memory-input').fill('0');
    // Below the minimum the warning waits UNDER_WARN_MS (700 ms) before it shows.
    await page.waitForTimeout(1000);
    await snap(page, 'ADD-SERVER-05-memory-invalid');
  });

  test('ADD-SERVER-06-path-preview', async ({ page }) => {
    await openShell(page);
    await chooseNewServer(page);
    await page.getByTestId('server-name-input').fill('survival-1');
    await expect(page.getByTestId('server-path-preview')).toContainText('survival-1');
    await snap(page, 'ADD-SERVER-06-path-preview');
  });

  test('ADD-SERVER-07-template', async ({ page }) => {
    // Save the existing server as a template first, so the Template select appears on the form.
    await openShell(page);
    await openServerMenu(page);
    await page.getByRole('menuitem', { name: 'Save as Template', exact: true }).click();
    await expect(page.getByTestId('feedback-dialog')).toBeVisible();
    await page.getByTestId('feedback-prompt-confirm').click();
    await expectText(page, 'Template saved');
    await chooseNewServer(page);
    const select = page.getByTestId('server-template-select');
    await expect(select).toBeVisible();
    await snap(page, 'ADD-SERVER-07-template');
    await select.click();
    await expect(page.getByRole('option', { name: 'No template', exact: true })).toBeVisible();
    await snap(page, 'ADD-SERVER-07-template-open');
  });

  test('ADD-SERVER-08-submit-behavior', async ({ page }) => {
    // Success: the modal closes and the created toast appears.
    await openShell(page, { scenario: 'default' });
    await chooseNewServer(page);
    await page.getByTestId('server-name-input').fill('e2e-created');
    await page.getByTestId('save-server-button').click();
    await expect(page.getByTestId('add-server-modal')).toHaveCount(0);
    await expectText(page, 'Server "e2e-created" created');
    await snap(page, 'ADD-SERVER-08-submit-behavior');
  });

  test('ADD-SERVER-08-submit-behavior-creating', async ({ page }) => {
    // Creating: the modal stays open with no visible progress; the create call is held.
    await openShell(page, {
      scenario: 'default',
      overrides: { create_server_profile: { delayMs: WAIT_LONG } },
    });
    await chooseNewServer(page);
    await page.getByTestId('server-name-input').fill('e2e-slow');
    await page.getByTestId('save-server-button').click();
    await expect(page.getByTestId('add-server-modal')).toBeVisible();
    await snap(page, 'ADD-SERVER-08-submit-behavior-creating');
  });

  test('ADD-SERVER-08-submit-behavior-failure', async ({ page }) => {
    // Failure: the modal stays open with the values, and the failure toast appears.
    await openShell(page, {
      scenario: 'default',
      overrides: { create_server_profile: { error: 'E2E create failed' } },
    });
    await chooseNewServer(page);
    await page.getByTestId('server-name-input').fill('e2e-failed');
    await page.getByTestId('save-server-button').click();
    await expectText(page, 'Failed to create server');
    await expect(page.getByTestId('add-server-modal')).toBeVisible();
    await snap(page, 'ADD-SERVER-08-submit-behavior-failure');
  });
});

// ---------------------------------------------------------------------------
// Import server
// ---------------------------------------------------------------------------

const IMPORT_READY = {
  token: 't',
  folderName: 'imported-e2e',
  detectedVersion: '1.21.10',
  detectedSoftware: 'Paper',
  eulaAccepted: true,
  hasServerJar: true,
};
const IMPORT_NO_JAR = {
  token: 't',
  folderName: 'old-server',
  detectedVersion: '1.21.10',
  detectedSoftware: 'Paper',
  eulaAccepted: false,
  hasServerJar: false,
};
const IMPORT_EULA_OPEN = { ...IMPORT_READY, eulaAccepted: false };

async function pickImportFolder(page: Page): Promise<void> {
  await page.getByTestId('import-select-folder-button').click();
}

test.describe('Import server', () => {
  test('IMPORT-01-empty', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await chooseImportServer(page);
    await snap(page, 'IMPORT-01-empty');
  });

  test('IMPORT-02-analyzing', async ({ page }) => {
    // The folder read is held by the mock, so the analysing state stays on screen.
    await openShell(page, {
      overrides: { pick_server_import: { delayMs: WAIT_LONG } },
      seed: (state) => {
        state.config.serverImportAnalysis = IMPORT_READY;
      },
    });
    await chooseImportServer(page);
    await pickImportFolder(page);
    // The skeleton label is the accessible name of a role=status element, not visible text.
    await expect(page.getByRole('status', { name: 'Reading the folder...' })).toBeVisible();
    await snap(page, 'IMPORT-02-analyzing');
  });

  test('IMPORT-03-no-jar', async ({ page }) => {
    await openShell(page, { seed: (state) => (state.config.serverImportAnalysis = IMPORT_NO_JAR) });
    await chooseImportServer(page);
    await pickImportFolder(page);
    await expectText(page, 'No server JAR found');
    await snap(page, 'IMPORT-03-no-jar');
  });

  test('IMPORT-04-analyzed', async ({ page }) => {
    await openShell(page, { seed: (state) => (state.config.serverImportAnalysis = IMPORT_READY) });
    await chooseImportServer(page);
    await pickImportFolder(page);
    await expect(page.getByTestId('import-name-input')).toHaveValue('imported-e2e');
    await snap(page, 'IMPORT-04-analyzed');
  });

  test('IMPORT-05-eula-warning', async ({ page }) => {
    await openShell(page, {
      seed: (state) => (state.config.serverImportAnalysis = IMPORT_EULA_OPEN),
    });
    await chooseImportServer(page);
    await pickImportFolder(page);
    await expectText(page, 'EULA not accepted');
    await snap(page, 'IMPORT-05-eula-warning');
  });

  test('IMPORT-06-invalid-port-memory', async ({ page }) => {
    await openShell(page, { seed: (state) => (state.config.serverImportAnalysis = IMPORT_READY) });
    await chooseImportServer(page);
    await pickImportFolder(page);
    // Same clamp as Add Server (see ADD-SERVER-04): the error lines are unreachable, so the screenshot shows the
    // over-limit warning on the field while the value is typed. The memory warning waits 700 ms.
    await page.getByTestId('import-port-input').fill('70000');
    await page.getByTestId('import-port-input').focus();
    await page.getByTestId('import-memory-input').fill('0');
    await page.waitForTimeout(1000);
    await snap(page, 'IMPORT-06-invalid-port-memory');
  });

  test('IMPORT-07-submit', async ({ page }) => {
    await openShell(page, { seed: (state) => (state.config.serverImportAnalysis = IMPORT_READY) });
    await chooseImportServer(page);
    await pickImportFolder(page);
    await page.getByTestId('import-server-submit').click();
    await expect(page.getByTestId('import-server-modal')).toHaveCount(0);
    await expectText(page, 'Server imported successfully');
    await snap(page, 'IMPORT-07-submit');
  });

  test('IMPORT-08-pick-cancelled', async ({ page }) => {
    await openShell(page, { seed: (state) => (state.config.serverImportAnalysis = IMPORT_READY) });
    await chooseImportServer(page);
    await pickImportFolder(page);
    await expect(page.getByTestId('import-name-input')).toHaveValue('imported-e2e');
    // The picker now reports a cancel (null). The previous analysis must stay.
    await page.evaluate(() => {
      const runtime = (window as ShellWindow).__MC_VECTOR_E2E__;
      if (runtime) runtime.state.config.serverImportAnalysis = null;
    });
    await pickImportFolder(page);
    await expect(page.getByTestId('import-name-input')).toHaveValue('imported-e2e');
    await snap(page, 'IMPORT-08-pick-cancelled');
  });
});

// ---------------------------------------------------------------------------
// EULA gate
// ---------------------------------------------------------------------------

async function createAndStartServer(page: Page): Promise<void> {
  await createServerUi(page, { name: 'e2e-x' });
  await page.getByTestId('server-start-button').click();
}

test.describe('EULA gate', () => {
  test('EULA-01-pending', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await createServerUi(page, { name: 'e2e-x' });
    await page.getByTestId('server-start-button').click();
    await expect(page.getByTestId('server-eula-modal')).toBeVisible();
    await snap(page, 'EULA-01-pending');
  });

  test('EULA-02-checked', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await createAndStartServer(page);
    await page.getByTestId('server-eula-checkbox').click();
    await expect(page.getByTestId('server-eula-accept')).toBeEnabled();
    await snap(page, 'EULA-02-checked');
  });

  test('EULA-03-saving', async ({ page }) => {
    await openShell(page, {
      scenario: 'default',
      overrides: { accept_server_eula: { delayMs: WAIT_LONG } },
    });
    await createAndStartServer(page);
    await page.getByTestId('server-eula-checkbox').click();
    await page.getByTestId('server-eula-accept').click();
    await expect(page.getByTestId('server-eula-cancel')).toBeDisabled();
    await snap(page, 'EULA-03-saving');
  });

  test('EULA-04-error', async ({ page }) => {
    await openShell(page, {
      scenario: 'default',
      overrides: { accept_server_eula: { error: 'E2E EULA write failed' } },
    });
    await createAndStartServer(page);
    await page.getByTestId('server-eula-checkbox').click();
    await page.getByTestId('server-eula-accept').click();
    await expect(page.getByTestId('server-eula-error')).toBeVisible();
    await snap(page, 'EULA-04-error');
  });

  test('EULA-05-cancel-retry', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await createAndStartServer(page);
    await page.getByTestId('server-eula-cancel').click();
    await expect(page.getByTestId('server-eula-modal')).toHaveCount(0);
    await snap(page, 'EULA-05-cancel-retry');
    // Start again reopens the gate.
    await page.getByTestId('server-start-button').click();
    await expect(page.getByTestId('server-eula-modal')).toBeVisible();
    await snap(page, 'EULA-05-cancel-retry-reopened');
  });
});

// ---------------------------------------------------------------------------
// Java manager
// ---------------------------------------------------------------------------

const JAVA_21 = { version: 21, path: '/mock/app-data/java/jdk-21/bin/java', name: 'Java 21' };
const JAVA_INSTALLED: Overrides = { get_java_versions: { response: [JAVA_21] } };

async function openJavaManager(page: Page): Promise<void> {
  await openGeneral(page);
  await page.getByTestId('server-settings-java-manage-button').click();
  await expect(page.getByTestId('java-manager-dialog')).toBeVisible({ timeout: 15_000 });
}

test.describe('Java manager', () => {
  test('JAVA-01-root', async ({ page }) => {
    await openShell(page);
    await openJavaManager(page);
    await snap(page, 'JAVA-01-root');
  });

  test('JAVA-02-card-download', async ({ page }) => {
    await openShell(page);
    await openJavaManager(page);
    await expect(page.getByTestId('java-download-21')).toBeEnabled();
    await snap(page, 'JAVA-02-card-download');
    // Variant: another download running disables the other Download buttons.
    const busy = await variantPage(page);
    await openShell(busy, { overrides: { download_java: { delayMs: WAIT_LONG } } });
    await openJavaManager(busy);
    await busy.getByTestId('java-download-21').click();
    await expect(busy.getByTestId('java-download-8')).toBeDisabled();
    await snap(busy, 'JAVA-02-card-download-disabled');
  });

  test('JAVA-03-card-downloading', async ({ page }) => {
    await openShell(page, { overrides: { download_java: { delayMs: WAIT_LONG } } });
    await openJavaManager(page);
    await page.getByTestId('java-download-21').click();
    await emitEvent(page, 'java-download-progress', { progress: 42 });
    await expect(page.getByTestId('java-download-status')).toBeVisible();
    await snap(page, 'JAVA-03-card-downloading');
  });

  test('JAVA-04-card-installed', async ({ page }) => {
    await openShell(page, { overrides: JAVA_INSTALLED });
    await openJavaManager(page);
    await expect(page.getByTestId('java-installed-21')).toBeVisible();
    await snap(page, 'JAVA-04-card-installed');
  });

  test('JAVA-05-installed-empty', async ({ page }) => {
    await openShell(page);
    await openJavaManager(page);
    await expectText(page, 'No Java runtimes installed');
    await snap(page, 'JAVA-05-installed-empty');
  });

  test('JAVA-06-installed-row', async ({ page }) => {
    await openShell(page, { overrides: JAVA_INSTALLED });
    await openJavaManager(page);
    await expect(
      page.getByTestId('java-manager-dialog').getByRole('button', { name: 'Delete', exact: true }),
    ).toBeVisible();
    await snap(page, 'JAVA-06-installed-row');
  });

  test('JAVA-07-select-existing', async ({ page }) => {
    await openShell(page);
    await openJavaManager(page);
    await setDialogPath(page, '/mock/java/bin/java');
    await page.getByRole('button', { name: 'Select Existing Java', exact: true }).click();
    await expectText(page, 'Copied path to clipboard');
    await snap(page, 'JAVA-07-select-existing');
  });

  test('JAVA-07-select-existing-cancelled', async ({ page }) => {
    await openShell(page);
    await openJavaManager(page);
    await setDialogPath(page, null);
    await page.getByRole('button', { name: 'Select Existing Java', exact: true }).click();
    await expectText(page, 'Selection was cancelled');
    await snap(page, 'JAVA-07-select-existing-cancelled');
  });

  test('JAVA-08-busy-lock', async ({ page }) => {
    await openShell(page, { overrides: { download_java: { delayMs: WAIT_LONG } } });
    await openJavaManager(page);
    await page.getByTestId('java-download-21').click();
    await expect(page.getByTestId('java-manager-close')).toBeDisabled();
    await snap(page, 'JAVA-08-busy-lock');
  });
});

// ---------------------------------------------------------------------------
// Version upgrade wizard
// ---------------------------------------------------------------------------

const UPGRADE_PLAN = {
  planId: `${SERVER_ID}:upgrade:1.21.11`,
  latestVersion: '1.21.11',
  verified: true,
};

function upgradeOverrides(plan: Record<string, unknown> = {}, extra: Overrides = {}): Overrides {
  return {
    prepare_server_jar_install: { response: { ...UPGRADE_PLAN, ...plan } },
    ...extra,
  };
}

async function openWizard(page: Page): Promise<void> {
  await openGeneral(page);
  await page.getByRole('button', { name: 'Upgrade Version', exact: true }).click();
  await expect(page.getByTestId('version-upgrade-wizard')).toBeVisible({ timeout: 15_000 });
}

async function startUpgrade(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start Upgrade', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run Backup', exact: true })).toBeVisible();
}

async function runBackup(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Run Backup', exact: true }).click();
}

async function runDownload(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Download & Update', exact: true }).click();
}

/** Opens the wizard on an offline server and walks it through the backup step to the download step. */
async function wizardToDownload(page: Page): Promise<void> {
  await openWizard(page);
  await startUpgrade(page);
  await runBackup(page);
  await expect(page.getByRole('button', { name: 'Download & Update', exact: true })).toBeVisible();
}

test.describe('Version upgrade wizard', () => {
  test('WIZ-01-check-fetching', async ({ page }) => {
    await openShell(page, { overrides: { prepare_server_jar_install: { delayMs: WAIT_LONG } } });
    await openWizard(page);
    await expectText(page, 'Checking for latest version...');
    await snap(page, 'WIZ-01-check-fetching');
  });

  test('WIZ-02-check-running-latest', async ({ page }) => {
    await openShell(page, { running: true });
    await openWizard(page);
    await expectText(page, 'Already up to date');
    await expectText(page, 'Please stop the server before upgrading');
    await snap(page, 'WIZ-02-check-running-latest');
  });

  test('WIZ-02-check-offline-latest', async ({ page }) => {
    await openShell(page);
    await openWizard(page);
    await expectText(page, 'Already up to date');
    await snap(page, 'WIZ-02-check-offline-latest');
  });

  test('WIZ-03-start-upgrade-available', async ({ page }) => {
    await openShell(page, { overrides: upgradeOverrides() });
    await openWizard(page);
    await expect(page.getByRole('button', { name: 'Start Upgrade', exact: true })).toBeVisible();
    await snap(page, 'WIZ-03-start-upgrade-available');
  });

  test('WIZ-04-unsupported', async ({ page }) => {
    await openShell(page, { overrides: { prepare_server_jar_install: { response: null } } });
    await openWizard(page);
    await expectText(page, 'Automatic upgrade is not supported for this software');
    await snap(page, 'WIZ-04-unsupported');
  });

  test('WIZ-05-backup-step', async ({ page }) => {
    await openShell(page, { overrides: upgradeOverrides() });
    await openWizard(page);
    await startUpgrade(page);
    await snap(page, 'WIZ-05-backup-step');
  });

  test('WIZ-05-backup-step-running', async ({ page }) => {
    // The backup is held, and a progress event moves the bar off zero.
    await openShell(page, {
      overrides: upgradeOverrides({}, { create_managed_backup: { delayMs: WAIT_LONG } }),
    });
    await openWizard(page);
    await startUpgrade(page);
    await runBackup(page);
    await expectText(
      page,
      'A backup or download is running. This window stays open until it finishes, so the server files are not left half-written.',
    );
    await emitEvent(page, 'backup-progress', { serverId: SERVER_ID, progress: 45 });
    await snap(page, 'WIZ-05-backup-step-running');
  });

  test('WIZ-06-download-step', async ({ page }) => {
    await openShell(page, { overrides: upgradeOverrides() });
    await wizardToDownload(page);
    await snap(page, 'WIZ-06-download-step');
  });

  test('WIZ-06-download-step-unverified', async ({ page }) => {
    await openShell(page, { overrides: upgradeOverrides({ verified: false }) });
    await wizardToDownload(page);
    await expect(
      page.getByRole('button', { name: 'Download & Update', exact: true }),
    ).toBeDisabled();
    await snap(page, 'WIZ-06-download-step-unverified');
  });

  test('WIZ-07-done', async () => {
    // App bug (finding): ServerSettings.tsx:806-809 calls setShowVersionWizard(false) in the same handler that
    // changes the version. handleDownload in VersionUpgradeWizard.tsx then sets step "done", but the wizard has
    // already unmounted, so the Done step and its Close footer never paint. The download itself succeeds.
    recordSkippedA(
      'WIZ-07-done',
      'Unreachable in the app (app bug): ServerSettings.tsx:806-809 closes the wizard in the same handler that calls onServerVersionChanged, so the wizard unmounts before setStep("done") can paint. The "Upgrade complete" step never appears. The download and version change themselves run (verified by execute_server_jar_install in the mock).',
    );
  });

  test('WIZ-08-busy-guard', async ({ page }) => {
    // The download is held, so the busy notice stays and Close is disabled.
    await openShell(page, {
      overrides: upgradeOverrides({}, { execute_server_jar_install: { delayMs: WAIT_LONG } }),
    });
    await wizardToDownload(page);
    await runDownload(page);
    await expectText(
      page,
      'A backup or download is running. This window stays open until it finishes, so the server files are not left half-written.',
    );
    await snap(page, 'WIZ-08-busy-guard');
  });

  test('WIZ-09-steps-indicator', async ({ page }) => {
    await openShell(page, { overrides: upgradeOverrides() });
    await openWizard(page);
    await expect(page.getByLabel('Upgrade steps')).toBeVisible();
    await snap(page, 'WIZ-09-steps-indicator');
    // Variant: the download step highlights the third marker, with Check and Backup complete.
    const variant = await variantPage(page);
    await openShell(variant, { overrides: upgradeOverrides() });
    await wizardToDownload(variant);
    await snap(variant, 'WIZ-09-steps-indicator-download');
  });
});

// ---------------------------------------------------------------------------
// App update modal and release notes
// ---------------------------------------------------------------------------

const updateOption = (extra: E2eUpdaterOption = {}): E2eUpdaterOption => ({
  version: UPDATE_VERSION,
  body: SHORT_NOTES,
  ...extra,
});

/** Lets the mock finish an update download, so the Restart to Apply path is reachable. */
const CAN_UPDATE: Overrides = { can_update_app: { response: { can_update: true } } };

test.describe('App update modal', () => {
  test('UPDATE-01-available', async ({ page }) => {
    await openShell(page, { updater: updateOption() });
    await expect(page.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await expectText(page, `Version ${UPDATE_VERSION} is available`);
    await snap(page, 'UPDATE-01-available');
  });

  test('UPDATE-02-downloading', async ({ page }) => {
    // The download is held after the first chunk, so the progress stays on screen.
    await openShell(page, { updater: updateOption({ download: 'hold' }), overrides: CAN_UPDATE });
    await expect(page.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('update-modal-download-button').click();
    await expect(
      page.getByTestId('app-update-modal').getByText('Downloading the update', { exact: true }),
    ).toBeVisible();
    await snap(page, 'UPDATE-02-downloading');
  });

  test('UPDATE-03-error', async ({ page }) => {
    await openShell(page, {
      updater: updateOption({ download: 'fail', downloadError: 'E2E update package is corrupt' }),
      overrides: CAN_UPDATE,
    });
    await expect(page.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('update-modal-download-button').click();
    await expect(page.getByTestId('update-modal-retry')).toBeVisible();
    await expectText(page, 'The update could not be applied');
    await snap(page, 'UPDATE-03-error');
  });

  test('UPDATE-04-ready', async ({ page }) => {
    await openShell(page, { updater: updateOption({ download: 'finish' }), overrides: CAN_UPDATE });
    await expect(page.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('update-modal-download-button').click();
    await expect(page.getByTestId('update-modal-restart')).toBeVisible();
    await expectText(page, 'Download complete. Ready to restart and apply.');
    await snap(page, 'UPDATE-04-ready');
  });

  test('UPDATE-05-release-notes-long', async ({ page }) => {
    await openShell(page, { updater: updateOption({ body: LONG_NOTES }) });
    await expect(page.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await snap(page, 'UPDATE-05-release-notes-long');
  });

  test('RELNOTES-structured', async ({ page }) => {
    await openShell(page, { updater: updateOption() });
    await expect(page.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await snapAt(page, page.getByRole('article', { name: 'Release notes' }), 'RELNOTES-structured');
  });

  test('RELNOTES-plain', async ({ page }) => {
    await openShell(page, { updater: updateOption({ body: PLAIN_NOTES }) });
    await expect(page.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText('Plain release text without any headings.', { exact: false }),
    ).toBeVisible();
    await snap(page, 'RELNOTES-plain');
  });

  test('RELNOTES-empty', async ({ page }) => {
    await openShell(page, { updater: updateOption({ body: null }) });
    await expect(page.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Release Notes:', { exact: true })).toHaveCount(0);
    await snap(page, 'RELNOTES-empty');
  });
});

// ---------------------------------------------------------------------------
// Proxy network (setup and help)
// ---------------------------------------------------------------------------

async function openProxy(page: Page): Promise<void> {
  await go(page, 'proxy');
  await expect(page.getByTestId('proxy-view')).toBeVisible();
}

async function openProxyHelp(page: Page): Promise<void> {
  await openProxy(page);
  await page.getByTestId('proxy-view-help-button').click();
  await expect(page.getByTestId('proxy-help-view')).toBeVisible();
}

test.describe('Proxy network', () => {
  test('PROXY-view', async ({ page }) => {
    await openShell(page);
    await openProxy(page);
    await snap(page, 'PROXY-view');
  });

  test('PROXY-software', async ({ page }) => {
    await openShell(page);
    await openProxy(page);
    await page.getByLabel('Proxy Software', { exact: true }).click();
    await expect(page.getByRole('option', { name: /Velocity/ }).first()).toBeVisible();
    await snap(page, 'PROXY-software');
  });

  test('PROXY-port', async ({ page }) => {
    await openShell(page);
    await openProxy(page);
    await expect(page.getByLabel('Proxy Port', { exact: true })).toHaveValue('25577');
    await snap(page, 'PROXY-port');
  });

  test('PROXY-backends-empty', async ({ page }) => {
    await openShell(page, { scenario: 'default' });
    await openProxy(page);
    await expectText(page, 'No available backend servers');
    await snap(page, 'PROXY-backends-empty');
  });

  test('PROXY-backends-list', async ({ page }) => {
    await openShell(page);
    await openProxy(page);
    await expect(page.locator('#proxy-backend-server-1')).toBeVisible();
    await snap(page, 'PROXY-backends-list');
    await page.locator('#proxy-backend-server-1').check();
    await snap(page, 'PROXY-backends-list-selected');
  });

  test('PROXY-build', async ({ page }) => {
    await openShell(page);
    await openProxy(page);
    await page.locator('#proxy-backend-server-1').check();
    await expect(page.getByRole('button', { name: 'Build Network', exact: true })).toBeEnabled();
    await snap(page, 'PROXY-build');
    // Variant: the build is held, so the Building state stays on screen.
    const building = await variantPage(page);
    await openShell(building, { overrides: { configure_proxy_network: { delayMs: WAIT_LONG } } });
    await openProxy(building);
    await building.locator('#proxy-backend-server-1').check();
    await building.getByRole('button', { name: 'Build Network', exact: true }).click();
    await confirmDialog(building);
    await expectText(building, 'Building...');
    await snap(building, 'PROXY-build-building');
  });

  test('PROXY-help-button', async ({ page }) => {
    await openShell(page);
    await openProxy(page);
    await page.getByTestId('proxy-view-help-button').hover();
    await snap(page, 'PROXY-help-button');
  });

  test('PROXY-help-root', async ({ page }) => {
    await openShell(page);
    await openProxyHelp(page);
    await snap(page, 'PROXY-help-root');
  });

  test('PROXY-help-summary', async ({ page }) => {
    await openShell(page);
    await openProxyHelp(page);
    await snapAt(
      page,
      page.getByText('Recommended Software', { exact: true }),
      'PROXY-help-summary',
    );
  });

  test('PROXY-help-checklist', async ({ page }) => {
    await openShell(page);
    await openProxyHelp(page);
    await snapAt(
      page,
      page.getByText('Pre-Setup Checklist', { exact: true }),
      'PROXY-help-checklist',
    );
  });

  test('PROXY-help-step1', async ({ page }) => {
    await openShell(page);
    await openProxyHelp(page);
    await snapAt(page, page.getByText(/Step 1 ·/), 'PROXY-help-step1');
  });

  test('PROXY-help-step2', async ({ page }) => {
    await openShell(page);
    await openProxyHelp(page);
    await snapAt(page, page.getByText(/Step 2 ·/), 'PROXY-help-step2');
  });

  test('PROXY-help-step3', async ({ page }) => {
    await openShell(page);
    await openProxyHelp(page);
    await snapAt(page, page.getByText(/Step 3 ·/), 'PROXY-help-step3');
  });

  test('PROXY-help-done', async ({ page }) => {
    await openShell(page);
    await openProxyHelp(page);
    await snapAt(page, page.getByText(/Setup complete\./), 'PROXY-help-done');
  });

  test('PROXY-help-open-link-failed', async ({ page }) => {
    await openShell(page);
    await openProxyHelp(page);
    await setWindowFlag(page, '__openerFail', true);
    await page.getByRole('button', { name: 'Open Paper (Velocity)', exact: true }).click();
    await expectText(page, 'Could not open the link in your browser');
    await snap(page, 'PROXY-help-open-link-failed');
  });
});

// ---------------------------------------------------------------------------
// ngrok connection guide
// ---------------------------------------------------------------------------

async function openNgrokGuide(page: Page): Promise<void> {
  await openGeneral(page);
  await page.getByTestId('ngrok-connection-guide-button').click();
  await expect(page.getByTestId('ngrok-guide-view')).toBeVisible();
}

test.describe('ngrok guide', () => {
  test('NGROK-root', async ({ page }) => {
    await openShell(page);
    await openNgrokGuide(page);
    await snap(page, 'NGROK-root');
  });

  test('NGROK-summary', async ({ page }) => {
    await openShell(page);
    await openNgrokGuide(page);
    await snapAt(page, page.getByText('Information to Obtain', { exact: true }), 'NGROK-summary');
  });

  test('NGROK-checklist', async ({ page }) => {
    await openShell(page);
    await openNgrokGuide(page);
    await snapAt(page, page.getByText('Pre-connection Check', { exact: true }), 'NGROK-checklist');
  });

  test('NGROK-step1', async ({ page }) => {
    await openShell(page);
    await openNgrokGuide(page);
    await snapAt(page, page.getByText(/Step 1 ·/), 'NGROK-step1');
  });

  test('NGROK-step2', async ({ page }) => {
    await openShell(page);
    await openNgrokGuide(page);
    await snapAt(page, page.getByText(/Step 2 ·/), 'NGROK-step2');
  });

  test('NGROK-step3', async ({ page }) => {
    await openShell(page);
    await openNgrokGuide(page);
    await snapAt(page, page.getByText(/Step 3 ·/), 'NGROK-step3');
  });
});

// ---------------------------------------------------------------------------
// Feedback host: confirm, prompt, and feedback dialogs
// ---------------------------------------------------------------------------

async function openCloneConfirm(page: Page): Promise<void> {
  await openServerMenu(page);
  await page.getByRole('menuitem', { name: 'Clone', exact: true }).click();
  await expect(page.getByTestId('feedback-dialog')).toBeVisible();
}

async function openDeleteConfirm(page: Page): Promise<void> {
  await openServerMenu(page);
  await page.getByTestId(`delete-server-${SERVER_ID}`).click();
  await expect(page.getByTestId('feedback-dialog')).toBeVisible();
}

async function openTemplatePrompt(page: Page): Promise<void> {
  await openServerMenu(page);
  await page.getByRole('menuitem', { name: 'Save as Template', exact: true }).click();
  await expect(page.getByTestId('feedback-dialog')).toBeVisible();
}

async function openPluginBrowser(page: Page): Promise<void> {
  await go(page, 'plugins');
  await expect(page.getByTestId('plugin-search-input')).toBeVisible({ timeout: 15_000 });
}

test.describe('Feedback host', () => {
  test('FEEDBACK-host', async ({ page }) => {
    // The host renders whichever dialog is active. Shown here with the clone confirmation.
    await openShell(page);
    await openCloneConfirm(page);
    await snap(page, 'FEEDBACK-host');
  });

  test('CONFIRM-generic', async ({ page }) => {
    await openShell(page);
    await openCloneConfirm(page);
    await expect(page.getByTestId('feedback-confirm-cancel')).toBeVisible();
    await snap(page, 'CONFIRM-generic');
  });

  test('CONFIRM-generic-danger', async ({ page }) => {
    await openShell(page);
    await openDeleteConfirm(page);
    await expect(page.getByTestId('feedback-confirm-confirm')).toBeVisible();
    await snap(page, 'CONFIRM-generic-danger');
  });

  test('PROMPT-generic', async ({ page }) => {
    await openShell(page);
    await openTemplatePrompt(page);
    await expect(page.getByTestId('feedback-prompt-input')).not.toHaveValue('');
    await snap(page, 'PROMPT-generic');
  });

  test('PROMPT-generic-empty', async ({ page }) => {
    await openShell(page);
    await openTemplatePrompt(page);
    await page.getByTestId('feedback-prompt-input').fill('');
    await expect(page.getByTestId('feedback-prompt-confirm')).toBeDisabled();
    await snap(page, 'PROMPT-generic-empty');
  });

  test('PROMPT-validation-error', async () => {
    recordSkippedA(
      'PROMPT-validation-error',
      'No shell caller passes validate() to prompt(). The only prompt in the shell is the save-template prompt, which has no validator. The error text path (AppFeedbackProvider.tsx:175,261) is reachable only from a future caller.',
    );
  });

  test('FEEDBACK-dialog-primary-secondary', async () => {
    recordSkippedA(
      'FEEDBACK-dialog-primary-secondary',
      'No openDialog caller passes both primaryAction and secondaryAction. PluginBrowser passes primaryAction alone (install plan, duplicate file) or secondaryAction alone (unverified download, which renders a single button). The two-button footer exists in AppFeedbackProvider.tsx:181-205 but no call site reaches it.',
    );
  });

  test('FEEDBACK-dialog-primary-only', async ({ page }) => {
    // The install plan confirmation opens with a primary action only (PluginBrowser.tsx:1111).
    await openShell(page);
    await openPluginBrowser(page);
    await page.getByTestId('plugin-install-veinminer-project').click();
    await expect(page.getByTestId('feedback-dialog')).toContainText('Install this plugin?');
    await snap(page, 'FEEDBACK-dialog-primary-only');
  });

  test('FEEDBACK-dialog-info', async ({ page }) => {
    // The browser-open failure has no action, so the dialog shows a single Close button.
    await openShell(page);
    await openPluginBrowser(page);
    await setWindowFlag(page, '__openerFail', true);
    await page.getByTestId('plugin-details-veinminer-project').click();
    await page
      .getByTestId('plugin-detail-dialog')
      .getByRole('button', { name: 'Project Page', exact: false })
      .click();
    await expect(page.getByTestId('feedback-dialog')).toContainText('Could not open browser');
    await snap(page, 'FEEDBACK-dialog-info');
  });

  test('CONFIRM-unsaved-discard', async ({ page }) => {
    await openShell(page);
    await go(page, 'properties');
    const motd = page.getByLabel('MOTD', { exact: true });
    await expect(motd).toBeVisible({ timeout: 15_000 });
    await motd.fill('Changed in the reference capture');
    // The guard holds the view, so the click goes straight to the nav item and not through go().
    await page.getByTestId('nav-item-dashboard').click();
    await expect(page.getByTestId('feedback-dialog')).toContainText('Discard unsaved changes?');
    await snap(page, 'CONFIRM-unsaved-discard');
  });

  test('CONFIRM-exit-quit', async ({ page }) => {
    // The close request is replayed through the stored handler (the window mock keeps it).
    await openShell(page, { running: true });
    await page.waitForFunction(
      () => typeof (window as ShellWindow).__closeRequestedHandler === 'function',
    );
    await page.evaluate(() => {
      const handler = (window as ShellWindow).__closeRequestedHandler;
      void handler?.({ preventDefault: () => undefined });
    });
    await expect(page.getByTestId('feedback-dialog')).toContainText('Quit MC-Vector?');
    await snap(page, 'CONFIRM-exit-quit');
  });

  test('CONFIRM-delete-server', async ({ page }) => {
    await openShell(page);
    await openDeleteConfirm(page);
    await expect(page.getByTestId('feedback-dialog')).toContainText('Delete');
    await snap(page, 'CONFIRM-delete-server');
  });

  test('CONFIRM-clone-server', async ({ page }) => {
    await openShell(page);
    await openCloneConfirm(page);
    await expect(page.getByTestId('feedback-dialog')).toContainText('Clone "E2E Server"?');
    await snap(page, 'CONFIRM-clone-server');
  });

  test('PROMPT-save-template', async ({ page }) => {
    await openShell(page);
    await openTemplatePrompt(page);
    await expect(page.getByTestId('feedback-dialog')).toContainText('Save as template');
    await snap(page, 'PROMPT-save-template');
  });

  test('CONFIRM-bulk-stop-for-backup', async ({ page }) => {
    await openShell(page, { running: true });
    await page
      .getByTestId('server-list')
      .getByRole('button', { name: 'Select', exact: true })
      .click();
    await page.getByTestId(`server-card-${SERVER_ID}`).click();
    await page
      .getByTestId('server-list')
      .getByRole('button', { name: 'Backup', exact: true })
      .click();
    await expect(page.getByTestId('feedback-dialog')).toContainText('Stop Server for Backup');
    await snap(page, 'CONFIRM-bulk-stop-for-backup');
  });

  test('CONFIRM-proxy-build-few', async ({ page }) => {
    await openShell(page);
    await openProxy(page);
    await page.locator('#proxy-backend-server-1').check();
    await page.getByRole('button', { name: 'Build Network', exact: true }).click();
    await expect(page.getByTestId('feedback-dialog')).toContainText('Only 1 or fewer servers');
    await snap(page, 'CONFIRM-proxy-build-few');
  });

  test('CONFIRM-proxy-build', async ({ page }) => {
    // Two candidate backends, so the confirmation has no "few servers" line.
    await openShell(page, { scenario: 'default' });
    await createServerUi(page, { name: 'alpha-one' });
    await createServerUi(page, { name: 'beta-two' });
    await openProxy(page);
    const backends = page.locator('input[id^="proxy-backend-"], button[id^="proxy-backend-"]');
    await expect(backends).toHaveCount(2);
    await backends.nth(0).check();
    await backends.nth(1).check();
    await page.getByRole('button', { name: 'Build Network', exact: true }).click();
    await expect(page.getByTestId('feedback-dialog')).toContainText('Start configuration?');
    await snap(page, 'CONFIRM-proxy-build');
  });

  test('CONFIRM-java-delete', async ({ page }) => {
    await openShell(page, { overrides: JAVA_INSTALLED });
    await openJavaManager(page);
    await page
      .getByTestId('java-manager-dialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(page.getByTestId('feedback-dialog')).toContainText('Uninstall Java 21?');
    await snap(page, 'CONFIRM-java-delete');
  });
});

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

const TOAST_REGION = (page: Page) => page.getByRole('region', { name: /Notifications/ });

/** Walks through a list of toast cases, one fresh page each, and shoots the toast after its text appears. */
async function runToastCases(
  page: Page,
  prefix: string,
  cases: Array<{
    n: number;
    text: string | RegExp;
    options?: ShellOptions;
    act: (target: Page) => Promise<void>;
  }>,
): Promise<void> {
  for (const [index, step] of cases.entries()) {
    const target = index === 0 ? page : await variantPage(page);
    await openShell(target, step.options);
    await step.act(target);
    await expect(target.getByText(step.text).first()).toBeVisible({ timeout: 15_000 });
    await snap(target, `${prefix}-${step.n}`);
  }
}

const emitAutomationCase = (kind: Record<string, unknown>) => async (target: Page) => {
  await emitAutomation(target, kind as { kind: string });
};

test.describe('Toasts', () => {
  test('TOAST-stack', async ({ page }) => {
    // Group TOAST-stack: 1 one toast, 2 several toasts while collapsed, 3 expanded by hovering the stack.
    await openShell(page);
    await emitAutomation(page, { kind: 'auto_backup_created' });
    await expectText(page, 'Auto backup created for E2E Server');
    await snap(page, 'TOAST-stack-1');

    await emitAutomation(page, { kind: 'auto_restart_scheduled', seconds: 10, attempt: 1, max: 3 });
    await emitAutomation(page, { kind: 'auto_backup_failed' });
    await expectText(page, 'Auto backup failed for E2E Server');
    await snap(page, 'TOAST-stack-2');

    await TOAST_REGION(page).hover();
    await snap(page, 'TOAST-stack-3');
  });

  test('TOAST-types', async ({ page }) => {
    // Group TOAST-types, one PNG per type: 1 success, 2 info, 3 warning, 4 error, 5 loading.
    await runToastCases(page, 'TOAST-types', [
      {
        n: 1,
        text: 'Auto backup created for E2E Server',
        act: emitAutomationCase({ kind: 'auto_backup_created' }),
      },
      {
        n: 2,
        text: 'Auto restart scheduled for E2E Server in 10 seconds (attempt 1/3)',
        act: emitAutomationCase({
          kind: 'auto_restart_scheduled',
          seconds: 10,
          attempt: 1,
          max: 3,
        }),
      },
      {
        n: 3,
        text: 'Could not list backups during retention cleanup. The new backup was created, but retention was skipped',
        act: emitAutomationCase({ kind: 'auto_backup_retention_list_failed' }),
      },
      {
        n: 4,
        text: 'Auto backup failed for E2E Server',
        act: emitAutomationCase({ kind: 'auto_backup_failed' }),
      },
      {
        n: 5,
        text: 'Downloading',
        act: async (target) => {
          await emitEvent(target, 'download-progress', { serverId: SERVER_ID, progress: 45 });
        },
      },
    ]);
  });

  test('TOAST-loading-progress', async ({ page }) => {
    // Group TOAST-loading-progress: 1 runtime download, 2 server creation download, 3 app update download.
    await openShell(page);
    await emitEvent(page, 'download-progress', { serverId: SERVER_ID, progress: 45 });
    await expect(TOAST_REGION(page).getByRole('progressbar').first()).toBeVisible();
    await snap(page, 'TOAST-loading-progress-1');

    const creating = await variantPage(page);
    await openShell(creating, {
      scenario: 'default',
      overrides: { create_server_profile: { delayMs: WAIT_LONG } },
    });
    await chooseNewServer(creating);
    await creating.getByTestId('server-name-input').fill('e2e-progress');
    await creating.getByTestId('save-server-button').click();
    await emitCreationProgress(creating, 45);
    await expect(creating.getByText(/Downloading Paper 1\.21\.10/).first()).toBeVisible();
    await snap(creating, 'TOAST-loading-progress-2');

    const updating = await variantPage(page);
    await openShell(updating, {
      updater: updateOption({ download: 'hold' }),
      overrides: CAN_UPDATE,
    });
    await expect(updating.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await updating.getByTestId('update-modal-download-button').click();
    await expect(TOAST_REGION(updating).getByRole('progressbar').first()).toBeVisible();
    await snap(updating, 'TOAST-loading-progress-3');
  });

  test('TOAST-action', async ({ page }) => {
    // A finished update toast carries the Restart to Apply action.
    await openShell(page, { updater: updateOption({ download: 'finish' }), overrides: CAN_UPDATE });
    await expect(page.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('update-modal-download-button').click();
    await expect(
      TOAST_REGION(page).getByRole('button', { name: 'Restart to Apply', exact: true }),
    ).toBeVisible();
    await snap(page, 'TOAST-action');
  });

  test('TOAST-server-create', async ({ page }) => {
    // Group TOAST-server-create: 1 created, 2 JAR not installed (Forge), 3 creation progress, 4 create failed.
    await openShell(page, { scenario: 'default' });
    await createServerUi(page, { name: 'e2e-created' });
    await expectText(page, 'Server "e2e-created" created');
    await snap(page, 'TOAST-server-create-1');

    const forge = await variantPage(page);
    await openShell(forge, { scenario: 'default' });
    await createServerUi(forge, { name: 'e2e-forge', software: 'Forge' });
    await expectText(forge, 'Failed to get download URL. Please place the JAR manually.');
    await snap(forge, 'TOAST-server-create-2');

    const progress = await variantPage(page);
    await openShell(progress, {
      scenario: 'default',
      overrides: { create_server_profile: { delayMs: WAIT_LONG } },
    });
    await chooseNewServer(progress);
    await progress.getByTestId('server-name-input').fill('e2e-progress');
    await progress.getByTestId('save-server-button').click();
    await emitCreationProgress(progress, 45);
    await expect(progress.getByText(/Downloading Paper 1\.21\.10/).first()).toBeVisible();
    await snap(progress, 'TOAST-server-create-3');

    const failed = await variantPage(page);
    await openShell(failed, {
      scenario: 'default',
      overrides: { create_server_profile: { error: 'E2E create failed' } },
    });
    await chooseNewServer(failed);
    await failed.getByTestId('server-name-input').fill('e2e-failed');
    await failed.getByTestId('save-server-button').click();
    await expectText(failed, 'Failed to create server');
    await snap(failed, 'TOAST-server-create-4');
  });

  test('TOAST-server-import', async ({ page }) => {
    // Group TOAST-server-import: 1 imported, 2 picking the folder failed.
    await openShell(page, { seed: (state) => (state.config.serverImportAnalysis = IMPORT_READY) });
    await chooseImportServer(page);
    await pickImportFolder(page);
    await page.getByTestId('import-server-submit').click();
    await expectText(page, 'Server imported successfully');
    await snap(page, 'TOAST-server-import-1');

    const failed = await variantPage(page);
    await openShell(failed, { overrides: { pick_server_import: { error: 'E2E picker failed' } } });
    await chooseImportServer(failed);
    await pickImportFolder(failed);
    await expectText(failed, 'Failed to import server');
    await snap(failed, 'TOAST-server-import-2');
  });

  test('TOAST-server-context', async ({ page }) => {
    // Group TOAST-server-context: 1 deleted, 2 delete while running, 3 delete failed, 4 cloned,
    // 5 clone while running, 6 template saved, 7 template save failed. (Delete error is covered by 3.)
    await openShell(page);
    await openDeleteConfirm(page);
    await page.getByTestId('feedback-confirm-confirm').click();
    await expectText(page, 'Server deleted');
    await snap(page, 'TOAST-server-context-1');

    const runningDelete = await variantPage(page);
    await openShell(runningDelete, { running: true });
    await openDeleteConfirm(runningDelete);
    await runningDelete.getByTestId('feedback-confirm-confirm').click();
    await expectText(runningDelete, 'Cannot delete a running server');
    await snap(runningDelete, 'TOAST-server-context-2');

    // A false answer is the "Failed to delete server" branch. A thrown error gives "Delete error" instead.
    const deleteFailed = await variantPage(page);
    await openShell(deleteFailed, {
      overrides: { delete_managed_server: { response: false } },
    });
    await openDeleteConfirm(deleteFailed);
    await deleteFailed.getByTestId('feedback-confirm-confirm').click();
    await expectText(deleteFailed, 'Failed to delete server');
    await snap(deleteFailed, 'TOAST-server-context-3');

    const cloned = await variantPage(page);
    await openShell(cloned);
    await openCloneConfirm(cloned);
    await cloned.getByTestId('feedback-confirm-confirm').click();
    await expectText(cloned, 'Server cloned');
    await snap(cloned, 'TOAST-server-context-4');

    const cloneRunning = await variantPage(page);
    await openShell(cloneRunning, { running: true });
    await openCloneConfirm(cloneRunning);
    await cloneRunning.getByTestId('feedback-confirm-confirm').click();
    await expectText(cloneRunning, 'Failed to clone server');
    await snap(cloneRunning, 'TOAST-server-context-5');

    const templated = await variantPage(page);
    await openShell(templated);
    await openTemplatePrompt(templated);
    await templated.getByTestId('feedback-prompt-confirm').click();
    await expectText(templated, 'Template saved');
    await snap(templated, 'TOAST-server-context-6');

    const templateFailed = await variantPage(page);
    await openShell(templateFailed, {
      overrides: { save_server_template: { error: 'E2E template save failed' } },
    });
    await openTemplatePrompt(templateFailed);
    await templateFailed.getByTestId('feedback-prompt-confirm').click();
    await expectText(templateFailed, 'Failed to save template');
    await snap(templateFailed, 'TOAST-server-context-7');
  });

  test('TOAST-server-settings', async ({ page }) => {
    // Group TOAST-server-settings: 1 saved, 2 save failed.
    await openShell(page);
    await openGeneral(page);
    await page.getByTestId('server-settings-name-input').fill('renamed-server');
    await page.getByTestId('server-settings-save-button').click();
    await expectText(page, 'Settings saved');
    await snap(page, 'TOAST-server-settings-1');

    const failed = await variantPage(page);
    await openShell(failed, { overrides: { update_server: { error: 'E2E update failed' } } });
    await openGeneral(failed);
    await failed.getByTestId('server-settings-name-input').fill('renamed-server');
    await failed.getByTestId('server-settings-save-button').click();
    await expectText(failed, 'Failed to save settings');
    await snap(failed, 'TOAST-server-settings-2');
  });

  test('TOAST-server-process', async ({ page }) => {
    // Group TOAST-server-process: 1 start failed, 2 stop failed, 3 restart failed.
    // "No server selected" is not reachable: the header actions are disabled without a server.
    await openShell(page, { overrides: { start_server: { error: 'E2E start failed' } } });
    await page.getByTestId('server-start-button').click();
    await expectText(page, 'Failed to start server');
    await snap(page, 'TOAST-server-process-1');

    const stop = await variantPage(page);
    await openShell(stop, {
      running: true,
      overrides: { stop_server: { error: 'E2E stop failed' } },
    });
    await stop.getByTestId('server-stop-button').click();
    await expectText(stop, 'Failed to stop server');
    await snap(stop, 'TOAST-server-process-2');

    const restart = await variantPage(page);
    await openShell(restart, {
      running: true,
      overrides: { restart_server: { error: 'E2E restart failed' } },
    });
    await restart.getByTestId('server-restart-button').click();
    await expectText(restart, 'Failed to restart server');
    await snap(restart, 'TOAST-server-process-3');
  });

  test('TOAST-bulk-start', async ({ page }) => {
    await openShell(page, { overrides: { start_server: { error: 'E2E start failed' } } });
    await page
      .getByTestId('server-list')
      .getByRole('button', { name: 'Select', exact: true })
      .click();
    await page.getByTestId(`server-card-${SERVER_ID}`).click();
    await page.getByTestId('bulk-start-button').click();
    await expectText(page, 'Failed to start server');
    await snap(page, 'TOAST-bulk-start');
  });

  test('TOAST-bulk-backup', async ({ page }) => {
    // Group TOAST-bulk-backup, bulk Backup per server:
    // 1 created, 2 backup failed, 3 not created and not restarted, 4 could not be stopped (after the confirm),
    // 5 created but the registry failed, 6 created but the restart failed, 7 retention delete failed,
    // 8 retention list failed.
    const bulk = async (target: Page, confirm = false) => {
      await target
        .getByTestId('server-list')
        .getByRole('button', { name: 'Select', exact: true })
        .click();
      await target.getByTestId(`server-card-${SERVER_ID}`).click();
      await target
        .getByTestId('server-list')
        .getByRole('button', { name: 'Backup', exact: true })
        .click();
      if (confirm) await confirmDialog(target);
    };
    const created = {
      status: 'created',
      backupName: 'pre-e2e',
      catalogError: null,
      restart: { status: 'not_needed' },
    };
    const cases: Array<{
      n: number;
      text: string | RegExp;
      options?: ShellOptions;
      confirm?: boolean;
    }> = [
      { n: 1, text: 'Backup created for E2E Server' },
      {
        n: 2,
        text: 'Backup failed for E2E Server',
        options: { overrides: { create_managed_backup: { error: 'E2E backup failed' } } },
      },
      {
        n: 3,
        text: 'Backup for E2E Server was not created, and the server could not be restarted',
        options: {
          overrides: {
            create_managed_backup: {
              response: {
                status: 'failed',
                stage: 'restart',
                error: 'E2E restart failed',
                restartError: 'E2E restart failed',
              },
            },
          },
        },
      },
      {
        n: 4,
        text: 'The server could not be stopped, so no backup was created',
        confirm: true,
        options: {
          overrides: { create_managed_backup: { response: { status: 'confirmation_required' } } },
        },
      },
      {
        n: 5,
        text: 'The backup was created, but the backup registry could not be updated',
        options: {
          overrides: {
            create_managed_backup: {
              response: { ...created, catalogError: 'E2E registry write failed' },
            },
          },
        },
      },
      {
        n: 6,
        text: 'The backup was created, but the server could not be restarted',
        options: {
          overrides: {
            create_managed_backup: {
              response: { ...created, restart: { status: 'failed', error: 'E2E restart failed' } },
            },
          },
        },
      },
      // 7 "Failed to delete N backup(s) during retention cleanup" is unreachable (FINDING): apply_managed_backup_retention
      // is missing from src/lib/tauri-command-allowlist.ts, so tauriInvoke throws "Blocked tauri command" before the
      // IPC call. applyBackupRetention then reports listingFailed, so every bulk backup shows message 8 instead.
      // Message 8 needs no override for that reason; the default mock reaches it.
      {
        n: 8,
        text: 'Could not list backups during retention cleanup. The new backup was created, but retention was skipped',
      },
    ];
    for (const [index, item] of cases.entries()) {
      const target = index === 0 ? page : await variantPage(page);
      await openShell(target, item.options);
      await bulk(target, item.confirm === true);
      await expect(target.getByText(item.text).first()).toBeVisible({ timeout: 15_000 });
      await snap(target, `TOAST-bulk-backup-${item.n}`);
    }
  });

  test('TOAST-load-error', async ({ page }) => {
    // get_servers fails on mount, so the list load reports the error and no server appears.
    await openShell(page, {
      title: 'Servers',
      overrides: { get_servers: { error: 'E2E list failed' } },
    });
    await expectText(page, 'Failed to load server list');
    await snap(page, 'TOAST-load-error');
  });

  test('TOAST-download-complete', async ({ page }) => {
    await openShell(page);
    await emitEvent(page, 'download-progress', { serverId: SERVER_ID, progress: 100 });
    await expectText(page, 'Download complete');
    await snap(page, 'TOAST-download-complete');
  });

  test('TOAST-automation', async ({ page }) => {
    // Group TOAST-automation, one PNG per automation event (the Rust runtime sends these; M3 via emitter):
    // 1 restart scheduled, 2 restart limit reached, 3 restart triggered, 4 restart waiting for EULA,
    // 5 backup created, 6 backup failed, 7 retention delete failed, 8 retention list failed.
    await runToastCases(page, 'TOAST-automation', [
      {
        n: 1,
        text: 'Auto restart scheduled for E2E Server in 10 seconds (attempt 1/3)',
        act: emitAutomationCase({
          kind: 'auto_restart_scheduled',
          seconds: 10,
          attempt: 1,
          max: 3,
        }),
      },
      {
        n: 2,
        text: 'Auto restart limit reached for E2E Server',
        act: emitAutomationCase({ kind: 'auto_restart_limit_reached' }),
      },
      {
        n: 3,
        text: 'Auto restart triggered for E2E Server (attempt 1/3)',
        act: emitAutomationCase({ kind: 'auto_restart_failed', attempt: 1, max: 3 }),
      },
      {
        n: 4,
        text: 'Auto restart for E2E Server is waiting for Minecraft EULA acceptance.',
        act: emitAutomationCase({ kind: 'auto_restart_eula_required' }),
      },
      {
        n: 5,
        text: 'Auto backup created for E2E Server',
        act: emitAutomationCase({ kind: 'auto_backup_created' }),
      },
      {
        n: 6,
        text: 'Auto backup failed for E2E Server',
        act: emitAutomationCase({ kind: 'auto_backup_failed' }),
      },
      {
        n: 7,
        text: 'Failed to delete 2 backup(s) during retention cleanup',
        act: emitAutomationCase({ kind: 'auto_backup_retention_delete_failed', count: 2 }),
      },
      {
        n: 8,
        text: 'Could not list backups during retention cleanup. The new backup was created, but retention was skipped',
        act: emitAutomationCase({ kind: 'auto_backup_retention_list_failed' }),
      },
    ]);
  });

  test('TOAST-proxy', async ({ page }) => {
    // Group TOAST-proxy: 1 settings updated, 2 configuration error.
    const build = async (target: Page) => {
      await openProxy(target);
      await target.locator('#proxy-backend-server-1').check();
      await target.getByRole('button', { name: 'Build Network', exact: true }).click();
      await confirmDialog(target);
    };
    await openShell(page);
    await build(page);
    await expectText(
      page,
      'Updated settings for 1 server(s). Connect via Velocity proxy on port 25577.',
    );
    await snap(page, 'TOAST-proxy-1');

    const failed = await variantPage(page);
    await openShell(failed, {
      overrides: { configure_proxy_network: { error: 'E2E proxy failed' } },
    });
    await build(failed);
    await expectText(failed, 'Error during proxy configuration');
    await snap(failed, 'TOAST-proxy-2');
  });

  test('TOAST-java', async ({ page }) => {
    // Group TOAST-java, one PNG per message:
    // 1 "Failed to download Java" (a mock artifact: loadInstalled throws after the download, see M7),
    // 2 "Downloaded Java 21" (reachable once get_java_versions answers), 3 "Copied path to clipboard",
    // 4 "Selection was cancelled", 5 "Failed to remove Java 21", 6 "Removed Java 21",
    // 7 "Path: ..." (clipboard write fails).
    const pickBinary = async (target: Page, path: string | null) => {
      await openJavaManager(target);
      await setDialogPath(target, path);
      await target.getByRole('button', { name: 'Select Existing Java', exact: true }).click();
    };
    const removeRow = async (target: Page) => {
      await target
        .getByTestId('java-manager-dialog')
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await confirmDialog(target);
    };
    const cases: Array<{
      n: number;
      text: string;
      options?: ShellOptions;
      act: (target: Page) => Promise<void>;
    }> = [
      {
        n: 1,
        text: 'Failed to download Java',
        act: async (target) => {
          await openJavaManager(target);
          await target.getByTestId('java-download-21').click();
        },
      },
      {
        // Java 21 is already installed in this list (no Download button), so the download is for 17.
        n: 2,
        text: 'Downloaded Java 17',
        options: { overrides: JAVA_INSTALLED },
        act: async (target) => {
          await openJavaManager(target);
          await target.getByTestId('java-download-17').click();
        },
      },
      {
        n: 3,
        text: 'Copied path to clipboard',
        act: (target) => pickBinary(target, '/mock/java/bin/java'),
      },
      { n: 4, text: 'Selection was cancelled', act: (target) => pickBinary(target, null) },
      {
        n: 5,
        text: 'Failed to remove Java 21',
        options: { overrides: { ...JAVA_INSTALLED, delete_java: { error: 'E2E remove failed' } } },
        act: async (target) => {
          await openJavaManager(target);
          await removeRow(target);
        },
      },
      {
        n: 6,
        text: 'Removed Java 21',
        options: { overrides: { ...JAVA_INSTALLED, delete_java: { response: null } } },
        act: async (target) => {
          await openJavaManager(target);
          await removeRow(target);
        },
      },
      {
        n: 7,
        text: 'Path: /mock/java/bin/java',
        act: async (target) => {
          await setWindowFlag(target, '__clipboardFail', true);
          await pickBinary(target, '/mock/java/bin/java');
        },
      },
    ];
    for (const [index, item] of cases.entries()) {
      const target = index === 0 ? page : await variantPage(page);
      await openShell(target, item.options);
      await item.act(target);
      await expectText(target, item.text);
      await snap(target, `TOAST-java-${item.n}`);
    }
  });

  test('TOAST-wizard', async ({ page }) => {
    // Group TOAST-wizard, one PNG per wizard message:
    // 1 stop the server first (the server came online during the wizard), 2 not created and not restarted,
    // 3 could not be stopped, 4 backup failed, 5 registry warning, 6 restart warning, 7 download failed.
    const backupCase = (response: unknown) =>
      upgradeOverrides({}, { create_managed_backup: { response } });
    const cases: Array<{
      n: number;
      text: string;
      overrides?: Overrides;
      act: (target: Page) => Promise<void>;
    }> = [
      {
        n: 1,
        text: 'Please stop the server before upgrading',
        overrides: upgradeOverrides(),
        act: async (target) => {
          await openWizard(target);
          await startUpgrade(target);
          // The mock refuses the backup only when its own running list has the server, so set both.
          await target.evaluate((serverId) => {
            const runtime = (window as ShellWindow).__MC_VECTOR_E2E__;
            if (runtime) runtime.state.runningServerIds = [serverId];
          }, SERVER_ID);
          await emitEvent(target, 'server-status-change', {
            serverId: SERVER_ID,
            status: 'online',
          });
          await runBackup(target);
        },
      },
      {
        n: 2,
        text: 'Backup for E2E Server was not created, and the server could not be restarted',
        overrides: backupCase({
          status: 'failed',
          stage: 'restart',
          error: 'E2E restart failed',
          restartError: 'E2E restart failed',
        }),
        act: async (target) => {
          await openWizard(target);
          await startUpgrade(target);
          await runBackup(target);
        },
      },
      {
        n: 3,
        text: 'The server could not be stopped, so no backup was created',
        overrides: backupCase({ status: 'failed', stage: 'stop', error: 'E2E stop failed' }),
        act: async (target) => {
          await openWizard(target);
          await startUpgrade(target);
          await runBackup(target);
        },
      },
      {
        n: 4,
        text: 'Backup failed',
        overrides: upgradeOverrides({}, { create_managed_backup: { error: 'E2E backup failed' } }),
        act: async (target) => {
          await openWizard(target);
          await startUpgrade(target);
          await runBackup(target);
        },
      },
      {
        n: 5,
        text: 'The backup was created, but the backup registry could not be updated',
        overrides: backupCase({
          status: 'created',
          backupName: 'pre-upgrade',
          catalogError: 'E2E registry failed',
          restart: { status: 'not_needed' },
        }),
        act: async (target) => {
          await openWizard(target);
          await startUpgrade(target);
          await runBackup(target);
        },
      },
      {
        n: 6,
        text: 'The backup was created, but the server could not be restarted',
        overrides: backupCase({
          status: 'created',
          backupName: 'pre-upgrade',
          catalogError: null,
          restart: { status: 'failed', error: 'E2E restart failed' },
        }),
        act: async (target) => {
          await openWizard(target);
          await startUpgrade(target);
          await runBackup(target);
        },
      },
      {
        n: 7,
        text: 'Download failed',
        overrides: upgradeOverrides(
          {},
          { execute_server_jar_install: { error: 'E2E download failed' } },
        ),
        act: async (target) => {
          await wizardToDownload(target);
          await runDownload(target);
        },
      },
    ];
    for (const [index, item] of cases.entries()) {
      const target = index === 0 ? page : await variantPage(page);
      await openShell(target, { overrides: item.overrides });
      await item.act(target);
      await expectText(target, item.text);
      await snap(target, `TOAST-wizard-${item.n}`);
    }
  });

  test('TOAST-open-link-failed', async ({ page }) => {
    // Group TOAST-open-link-failed: 1 proxy setup guide link, 2 ngrok dashboard link.
    await openShell(page);
    await openProxyHelp(page);
    await setWindowFlag(page, '__openerFail', true);
    await page.getByRole('button', { name: 'Open Paper (Velocity)', exact: true }).click();
    await expectText(page, 'Could not open the link in your browser');
    await snap(page, 'TOAST-open-link-failed-1');

    const ngrok = await variantPage(page);
    await openShell(ngrok);
    await openNgrokGuide(ngrok);
    await setWindowFlag(ngrok, '__openerFail', true);
    await ngrok.getByRole('button', { name: 'Open ngrok Dashboard', exact: true }).click();
    await expectText(ngrok, 'Could not open the link in your browser');
    await snap(ngrok, 'TOAST-open-link-failed-2');
  });

  test('TOAST-update', async ({ page }) => {
    // Group TOAST-update: 1 download progress (loading), 2 download finished with Restart to Apply, 3 restart failed.
    await openShell(page, { updater: updateOption({ download: 'hold' }), overrides: CAN_UPDATE });
    await expect(page.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('update-modal-download-button').click();
    await expect(TOAST_REGION(page).getByRole('progressbar').first()).toBeVisible();
    await snap(page, 'TOAST-update-1');

    const ready = await variantPage(page);
    await openShell(ready, {
      updater: updateOption({ download: 'finish' }),
      overrides: CAN_UPDATE,
    });
    await expect(ready.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await ready.getByTestId('update-modal-download-button').click();
    await expectText(ready, 'Restart to apply the update?');
    await snap(ready, 'TOAST-update-2');

    const restart = await variantPage(page);
    await openShell(restart, {
      updater: updateOption({ download: 'finish', relaunchError: 'E2E relaunch failed' }),
      overrides: CAN_UPDATE,
    });
    await expect(restart.getByTestId('app-update-modal')).toBeVisible({ timeout: 15_000 });
    await restart.getByTestId('update-modal-download-button').click();
    await restart.getByTestId('update-modal-restart').click();
    await expectText(restart, 'The update could not be applied');
    await snap(restart, 'TOAST-update-3');
  });

  test('TOAST-os-notification', async () => {
    recordSkippedA(
      'TOAST-os-notification',
      'Native OS notification (sendServerNotification via tauri-plugin-notification) for a server start or crash. It is drawn by the operating system outside the WebView, and the notification mock (tests/mocks/tauri-plugin-notification.ts) is a no-op with no call record, so neither a pixel nor a call can be captured in the window.',
    );
  });
});

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

test.describe('Shortcuts', () => {
  test('SHORTCUT-cycle-tab', async ({ page }) => {
    await openShell(page);
    await page.keyboard.press('Control+Tab');
    await expect(page.getByTestId('nav-item-console')).toHaveAttribute('aria-current', 'page');
    await snap(page, 'SHORTCUT-cycle-tab');
  });

  test('SHORTCUT-global-start-stop-restart', async ({ page }) => {
    // The OS shortcut is replayed by calling the handler the app registered (M5). The screenshot shows the result.
    await openShell(page);
    await page.waitForFunction(
      () =>
        typeof (window as ShellWindow).__globalShortcutHandlers?.['CmdOrCtrl+Shift+S'] ===
        'function',
    );
    await page.evaluate(() => {
      (window as ShellWindow).__globalShortcutHandlers?.['CmdOrCtrl+Shift+S']?.();
    });
    await expect(page.getByTestId('server-stop-button')).toBeEnabled();
    await snap(page, 'SHORTCUT-global-start-stop-restart');
  });

  test('SHORTCUT-alt-t', async ({ page }) => {
    await openShell(page);
    await emitAutomation(page, { kind: 'auto_backup_created' });
    await expectText(page, 'Auto backup created for E2E Server');
    await page.keyboard.press('Alt+T');
    await expect(page.getByRole('button', { name: 'Dismiss notification' }).first()).toBeFocused();
    await snap(page, 'SHORTCUT-alt-t');
  });
});

// ---------------------------------------------------------------------------
// Tooltips and overlays
// ---------------------------------------------------------------------------

test.describe('Tooltips', () => {
  test('TOOLTIP-sidebar-toggle', async ({ page }) => {
    // Group TOOLTIP-sidebar-toggle: 1 "Collapse sidebar" (expanded), 2 "Expand sidebar" (collapsed).
    await openShell(page);
    await snapTooltip(
      page,
      page.getByTestId('sidebar-toggle-button'),
      'Collapse sidebar',
      'TOOLTIP-sidebar-toggle-1',
    );
    await page.getByTestId('sidebar-toggle-button').click();
    await page.mouse.move(0, 0);
    await snapTooltip(
      page,
      page.getByTestId('sidebar-toggle-button'),
      'Expand sidebar',
      'TOOLTIP-sidebar-toggle-2',
    );
  });

  test('TOOLTIP-field-hint', async ({ page }) => {
    // Group TOOLTIP-field-hint: 1 Proxy Port hint, 2 Update channel hint (the stable description).
    await openShell(page);
    await openProxy(page);
    await snapTooltip(
      page,
      page.getByTestId('hint-icon').first(),
      'The port players initially connect to',
      'TOOLTIP-field-hint-1',
    );
    const settings = await variantPage(page);
    await openShell(settings);
    await goSettings(settings);
    await snapTooltip(
      settings,
      settings.getByTestId('hint-icon').first(),
      'Use the latest tested releases recommended for everyday use.',
      'TOOLTIP-field-hint-2',
    );
  });
});

test.describe('Rail tooltips (1000 px)', () => {
  test.use({ viewport: { width: 1000, height: 800 } });

  test('TOOLTIP-rail', async ({ page }) => {
    // Group TOOLTIP-rail: 1 Switch server, 2 Add Server, 3 Application Preferences.
    await openShell(page);
    await snapTooltip(
      page,
      page.getByTestId('rail-server-switcher'),
      'Switch server',
      'TOOLTIP-rail-1',
    );
    await snapTooltip(
      page,
      page.getByTestId('rail-add-server-button'),
      'Add Server',
      'TOOLTIP-rail-2',
    );
    await snapTooltip(
      page,
      page.getByTestId('rail-settings-button'),
      'Application Preferences',
      'TOOLTIP-rail-3',
    );
  });
});

test.describe('Compact header tooltips (880 px)', () => {
  test.use({ viewport: { width: 880, height: 800 } });

  test('TOOLTIP-header-1', async ({ page }) => {
    // Group TOOLTIP-header: 1 Start (offline, so Start is enabled), 2 Restart, 3 Stop (online).
    // 4 Open menu is in the drawer block below.
    await openShell(page);
    await snapTooltip(page, page.getByTestId('server-start-button'), 'Start', 'TOOLTIP-header-1');
  });

  test('TOOLTIP-header-2', async ({ page }) => {
    await openShell(page, { running: true });
    await snapTooltip(
      page,
      page.getByTestId('server-restart-button'),
      'Restart',
      'TOOLTIP-header-2',
    );
  });

  test('TOOLTIP-header-3', async ({ page }) => {
    await openShell(page, { running: true });
    await snapTooltip(page, page.getByTestId('server-stop-button'), 'Stop', 'TOOLTIP-header-3');
  });
});

test.describe('Overlay layer', () => {
  test('OVERLAY-layer', async ({ page }) => {
    // Closed by default: no modal is open on the first frame.
    await openShell(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await snap(page, 'OVERLAY-layer');
  });
});
