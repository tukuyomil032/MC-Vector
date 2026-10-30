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

describe('modrinth legacy adapter IPC compatibility', () => {
  it('retains its public signature without making renderer HTTP requests', async () => {
    const { searchModrinthProjects } = await import('@/lib/adapters/plugin/modrinth-adapter');
    const params = { query: 'plugin', facets: '', offset: 0, limit: 20 };
    const payload = { fixture: true };
    tauriInvokeMock.mockResolvedValueOnce(payload);
    expect(await searchModrinthProjects(params)).toBe(payload);
    expect(tauriInvokeMock).toHaveBeenCalledWith('search_plugin_modrinth', params);
  });
});
