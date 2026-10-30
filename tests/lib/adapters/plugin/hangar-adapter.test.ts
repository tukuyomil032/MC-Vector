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

describe('hangar legacy adapter IPC compatibility', () => {
  it('retains its public signature without making renderer HTTP requests', async () => {
    const { searchHangarProjects } = await import('@/lib/adapters/plugin/hangar-adapter');
    const params = { query: 'plugin', offset: 0, limit: 25 };
    const payload = { fixture: true };
    tauriInvokeMock.mockResolvedValueOnce(payload);
    expect(await searchHangarProjects(params)).toBe(payload);
    expect(tauriInvokeMock).toHaveBeenCalledWith('search_plugin_hangar', params);
  });
});
