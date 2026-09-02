import { type Page, test as base, expect } from '@playwright/test';
import { type E2eCall, type E2eScenario, type E2eState, createE2eState } from './e2e-runtime';

type E2eWindow = Window & {
  __MC_VECTOR_E2E__?: {
    version: 1;
    scenario: E2eScenario;
    calls: E2eCall[];
    state: E2eState;
  };
};

export interface AppFixture {
  gotoApp(scenario?: E2eScenario): Promise<void>;
  createServer(options?: {
    software?: 'Paper' | 'Fabric' | 'Forge';
    version?: string;
    serverId?: string;
  }): Promise<string>;
  selectServer(serverId: string): Promise<void>;
  openView(view: string): Promise<void>;
  setBackupSelection(paths: string[]): Promise<void>;
  ipcCalls(name?: string): Promise<E2eCall[]>;
  clearCalls(): Promise<void>;
  expectNoIpcCall(name: string): Promise<void>;
}

function runtimeStateForScenario(scenario: E2eScenario): E2eState {
  return createE2eState(scenario);
}

export function createAppFixture(page: Page): AppFixture {
  const ensureSidebarOpen = async () => {
    const sidebar = page.locator('[data-testid="app-sidebar"]');
    const className = await sidebar.getAttribute('class');
    if (!className?.includes('app-sidebar--open')) {
      await page.locator('[data-testid="sidebar-toggle-button"]').click();
      await expect(sidebar).toHaveClass(/app-sidebar--open/);
    }
  };

  return {
    async gotoApp(scenario = 'default') {
      const state = runtimeStateForScenario(scenario);
      await page.addInitScript(
        ({ scenario: initialScenario, state: initialState }) => {
          (window as E2eWindow).__MC_VECTOR_E2E__ = {
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
      if (state.servers.length > 0) {
        await expect(
          page.locator(`[data-testid="server-card-${state.servers[0].id}"]`),
        ).toBeVisible({
          timeout: 15_000,
        });
      }
    },

    async createServer(options = {}) {
      await ensureSidebarOpen();
      await page.locator('[data-testid="create-server-button"]').click();
      await page.locator('[data-testid="choice-new-server-button"]').click();
      const modal = page.locator('[data-testid="add-server-modal"]');
      await expect(modal).toBeVisible();
      const serverName = options.serverId ?? `e2e-${Date.now()}`;
      await modal.locator('[data-testid="server-name-input"]').fill(serverName);
      await modal.locator('[data-testid="server-port-input"]').fill('25565');
      await modal.locator('[data-testid="server-memory-input"]').fill('2');
      if (options.software) {
        await modal
          .locator('[data-testid="server-software-select"]')
          .selectOption(options.software);
      }
      if (options.version) {
        await modal.locator('[data-testid="server-version-select"]').selectOption(options.version);
      }
      await modal.locator('[data-testid="save-server-button"]').click();
      await expect(modal).toHaveCount(0, { timeout: 15_000 });
      const cards = page.locator('[data-testid^="server-card-"]');
      await expect(cards.last()).toBeVisible({ timeout: 15_000 });
      const testId = await cards.last().getAttribute('data-testid');
      const serverId = testId?.replace('server-card-', '');
      if (!serverId) throw new Error('The created server did not expose a stable id');
      return serverId;
    },

    async selectServer(serverId: string) {
      await page.locator(`[data-testid="server-card-${serverId}"]`).click();
    },

    async openView(view: string) {
      await ensureSidebarOpen();
      if (view === 'app-settings') {
        await page.locator('[data-testid="sidebar-brand-button"]').click();
        return;
      }
      await page.locator(`[data-testid="nav-item-${view}"]`).click();
    },

    async setBackupSelection(paths: string[]) {
      await page.evaluate((selectedPaths) => {
        const runtime = (window as E2eWindow).__MC_VECTOR_E2E__;
        if (runtime) runtime.state.selectedBackupPaths = selectedPaths;
      }, paths);
    },

    async ipcCalls(name?: string) {
      return page.evaluate((filter) => {
        const runtime = (window as E2eWindow).__MC_VECTOR_E2E__;
        const calls = runtime?.calls ?? [];
        return calls.filter((call) => call.kind === 'ipc' && (!filter || call.name === filter));
      }, name);
    },

    async clearCalls() {
      await page.evaluate(() => {
        const runtime = (window as E2eWindow).__MC_VECTOR_E2E__;
        if (runtime) runtime.calls = [];
      });
    },

    async expectNoIpcCall(name: string) {
      await expect.poll(async () => (await this.ipcCalls(name)).length).toBe(0);
    },
  };
}

export const test = base.extend<{ app: AppFixture }>({
  app: async ({ page }, use) => {
    await use(createAppFixture(page));
  },
});

export { expect };
