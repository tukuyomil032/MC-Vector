import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { tauriInvokeMock } = vi.hoisted(() => ({ tauriInvokeMock: vi.fn() }));
vi.mock('@/lib/tauri-api', () => ({ tauriInvoke: tauriInvokeMock }));

beforeEach(() => {
  vi.resetModules();
  tauriInvokeMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('spigot legacy adapter IPC compatibility', () => {
  it('retains its public signature without making renderer HTTP requests', async () => {
    const { searchSpigotResources } = await import('@/lib/adapters/plugin/spigot-adapter');
    const params = { query: 'plugin', page: 1, size: 25 };
    const payload = { fixture: true };
    tauriInvokeMock.mockResolvedValueOnce(payload);
    expect(await searchSpigotResources(params)).toBe(payload);
    expect(tauriInvokeMock).toHaveBeenCalledWith('search_plugin_spiget', params);
  });
});
