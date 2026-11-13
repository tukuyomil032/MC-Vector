import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Locator, type Page, expect } from '@playwright/test';
import {
  type E2eCommandOverride,
  type E2eFileNode,
  type E2eScenario,
  type E2eState,
  createE2eState,
} from '../e2e/support/e2e-runtime';

const REFERENCE_DIR = fileURLToPath(
  new URL('../../spec/idea/native-swiftui-edition/ui-reference/', import.meta.url),
);
export const SCREENS_DIR = path.join(REFERENCE_DIR, 'screens');
export const SKIPPED_FILE = path.join(SCREENS_DIR, '_skipped-b.json');
/** Skip list for the app-shell rows (shell.spec.ts). Same format as SKIPPED_FILE. */
export const SKIPPED_A_FILE = path.join(SCREENS_DIR, '_skipped-a.json');

export const SERVER_ID = 'server-1';
export const SERVER_ROOT = '/mock/app-data/servers/server-1';
export const BACKUP_ROOT = '/mock/app-data/backups/server-1';

type CaptureWindow = Window & {
  __MC_VECTOR_E2E__?: {
    version: 1;
    scenario: E2eScenario;
    calls: unknown[];
    state: E2eState;
    emit?: (event: string, payload?: unknown) => Promise<void>;
  };
  __clipboardFail?: boolean;
  __openerFail?: boolean;
  __dragDropHandler?: (event: { payload: unknown }) => Promise<void> | void;
};

export interface OpenAppOptions {
  /** Mock scenario. Defaults to paper-plugin-success, which seeds server-1 (Paper 1.21.10). */
  scenario?: E2eScenario;
  /** Starts server-1 before the first load, so the server reads as online. */
  running?: boolean;
  /** Edits the initial mock state in Node before the app loads (files, overrides, backups, servers). */
  seed?: (state: E2eState) => void;
  /** Waits for server-1's card before returning. Set false for scenarios with no server (default). */
  awaitServer?: boolean;
}

/** Loads the app with the mock state the capture needs. Mirrors the E2E fixture's gotoApp. */
export async function openApp(page: Page, options: OpenAppOptions = {}): Promise<void> {
  const scenario = options.scenario ?? 'paper-plugin-success';
  const state = createE2eState(scenario);
  if (options.running) state.runningServerIds = [SERVER_ID];
  options.seed?.(state);
  await page.addInitScript(
    ({ scenario: initialScenario, state: initialState }) => {
      (window as CaptureWindow).__MC_VECTOR_E2E__ = {
        version: 1,
        scenario: initialScenario,
        calls: [],
        state: initialState,
      };
    },
    { scenario, state },
  );
  await page.goto('/');
  await page.waitForSelector('[data-testid="app-root"]', { timeout: 15_000 });
  if (options.awaitServer === false) return;
  await expect(page.locator(`[data-testid="server-card-${SERVER_ID}"]`)).toBeVisible({
    timeout: 15_000,
  });
}

/** Opens a sidebar view, the same way the E2E fixture does. */
export async function openView(page: Page, view: string): Promise<void> {
  const sidebar = page.locator('[data-testid="app-sidebar"]');
  const className = (await sidebar.getAttribute('class')) ?? '';
  if (!className.includes('app-sidebar--open')) {
    await page.locator('[data-testid="sidebar-toggle-button"]').click();
    await expect(sidebar).toHaveClass(/app-sidebar--open/);
  }
  await page.locator(`[data-testid="nav-item-${view}"]`).click();
}

/** Opens a view and waits for its root test id. */
export async function openTab(
  page: Page,
  view: string,
  rootTestId: string,
  options: OpenAppOptions = {},
): Promise<void> {
  await openApp(page, options);
  await openView(page, view);
  await expect(page.locator(`[data-testid="${rootTestId}"]`)).toBeVisible({ timeout: 15_000 });
}

/** Full-viewport screenshot after fonts are ready. Overlays that are open stay in the shot. */
export async function snap(page: Page, id: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  mkdirSync(SCREENS_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENS_DIR, `${id}.png`),
    animations: 'disabled',
    caret: 'hide',
  });
  forgetSkipped(id);
}

/** Scrolls a card or panel into view, then takes the full-viewport shot. */
export async function snapAt(page: Page, target: Locator, id: string): Promise<void> {
  await target.first().scrollIntoViewIfNeeded();
  await snap(page, id);
}

/** Hovers a trigger until the tooltip containing `text` is visible, then takes the shot. */
export async function snapTooltip(
  page: Page,
  trigger: Locator,
  text: string | RegExp,
  id: string,
): Promise<void> {
  await trigger.first().hover();
  await expect(page.getByRole('tooltip').filter({ hasText: text }).first()).toBeVisible({
    timeout: 5_000,
  });
  await snap(page, id);
}

interface SkippedEntry {
  id: string;
  reason: string;
}

function readSkipped(file: string = SKIPPED_FILE): SkippedEntry[] {
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf8')) as SkippedEntry[];
}

function writeSkipped(entries: SkippedEntry[], file: string = SKIPPED_FILE): void {
  mkdirSync(SCREENS_DIR, { recursive: true });
  const sorted = [...entries].sort((left, right) => left.id.localeCompare(right.id));
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
}

function forgetSkipped(id: string): void {
  for (const file of [SKIPPED_FILE, SKIPPED_A_FILE]) {
    const entries = readSkipped(file);
    const remaining = entries.filter((entry) => entry.id !== id);
    if (remaining.length !== entries.length) writeSkipped(remaining, file);
  }
}

/** Records a row that cannot be captured, with the concrete reason, in screens/_skipped-b.json. */
export function recordSkipped(id: string, reason: string): void {
  const entries = readSkipped().filter((entry) => entry.id !== id);
  entries.push({ id, reason });
  writeSkipped(entries);
}

/** Records a shell row (inventory-a) that cannot be captured, in screens/_skipped-a.json. */
export function recordSkippedA(id: string, reason: string): void {
  const entries = readSkipped(SKIPPED_A_FILE).filter((entry) => entry.id !== id);
  entries.push({ id, reason });
  writeSkipped(entries, SKIPPED_A_FILE);
}

/** Sets or clears an opt-in IPC override on the running mock. */
export async function setCommandOverride(
  page: Page,
  command: string,
  override: E2eCommandOverride | null,
): Promise<void> {
  await page.evaluate(
    ({ command: name, override: value }) => {
      const runtime = (window as CaptureWindow).__MC_VECTOR_E2E__;
      if (!runtime) throw new Error('E2E runtime is missing');
      const overrides = { ...runtime.state.commandOverrides };
      if (value) overrides[name] = value;
      else delete overrides[name];
      runtime.state.commandOverrides = overrides;
    },
    { command, override },
  );
}

/** Pushes an event to the app's listeners, as the Rust side would emit it. */
export async function emitEvent(page: Page, event: string, payload: unknown): Promise<void> {
  await page.evaluate(
    async ({ event: name, payload: body }) => {
      const runtime = (window as CaptureWindow).__MC_VECTOR_E2E__;
      if (!runtime?.emit) throw new Error('E2E emit hook is missing');
      await runtime.emit(name, body);
    },
    { event, payload },
  );
}

/** Toggles one of the opt-in window flags the mocks read. */
export async function setWindowFlag(
  page: Page,
  flag: '__clipboardFail' | '__openerFail',
  value: boolean,
): Promise<void> {
  await page.evaluate(
    ({ flag: name, value: enabled }) => {
      (window as CaptureWindow)[name] = enabled;
    },
    { flag, value },
  );
}

/** Replaces or adds a file in the mock file map, keyed by absolute path. */
export async function setFile(page: Page, filePath: string, content: string): Promise<void> {
  await page.evaluate(
    ({ filePath: target, content: body }) => {
      const runtime = (window as CaptureWindow).__MC_VECTOR_E2E__;
      if (!runtime) throw new Error('E2E runtime is missing');
      runtime.state.files[target] = { kind: 'file', content: body, modified: Date.now() };
    },
    { filePath, content },
  );
}

/** Removes a path (and anything under it) from the mock file map. */
export async function removeFileTree(page: Page, filePath: string): Promise<void> {
  await page.evaluate((target: string) => {
    const runtime = (window as CaptureWindow).__MC_VECTOR_E2E__;
    if (!runtime) throw new Error('E2E runtime is missing');
    for (const key of Object.keys(runtime.state.files)) {
      if (key === target || key.startsWith(`${target}/`)) delete runtime.state.files[key];
    }
  }, filePath);
}

/** Replays an OS drag event through the handler the Files view registered. */
export async function replayDragEvent(page: Page, payload: Record<string, unknown>): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as CaptureWindow).__dragDropHandler === 'function',
  );
  await page.evaluate(async (body: Record<string, unknown>) => {
    const handler = (window as CaptureWindow).__dragDropHandler;
    if (!handler) throw new Error('Drag handler is not registered');
    await handler({ payload: body });
  }, payload);
}

/** Reads the mock's stored file content, or undefined when the path is not a file. */
export async function readFileContent(page: Page, filePath: string): Promise<string | undefined> {
  return page.evaluate((target: string) => {
    const node: E2eFileNode | undefined = (window as CaptureWindow).__MC_VECTOR_E2E__?.state.files[
      target
    ];
    return node?.kind === 'file' ? node.content : undefined;
  }, filePath);
}
