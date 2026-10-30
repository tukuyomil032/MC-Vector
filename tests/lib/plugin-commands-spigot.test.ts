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

describe('Spiget metadata IPC contract', () => {
  it('preserves pagination and returned DTOs', async () => {
    const { searchSpigot } = await import('@/lib/plugin-commands');
    const resources = [{ id: 1, name: 'Plugin' }];
    tauriInvokeMock.mockResolvedValueOnce(resources);
    expect(await searchSpigot('plugin', 0, 10)).toBe(resources);
    expect(tauriInvokeMock).toHaveBeenCalledWith('search_plugin_spiget', {
      query: 'plugin',
      page: 1,
      size: 10,
    });
  });

  it('passes the selected server version to Rust for install eligibility', async () => {
    const { searchSpigot } = await import('@/lib/plugin-commands');
    const resources = [
      { id: 1, name: 'Plugin', supportedVersions: ['1.20'], compatibility: 'incompatible' },
    ];
    tauriInvokeMock.mockResolvedValueOnce(resources);
    expect(await searchSpigot('plugin', 1, 25, undefined, '1.21.4')).toBe(resources);
    expect(tauriInvokeMock).toHaveBeenCalledWith('search_plugin_spiget', {
      query: 'plugin',
      page: 1,
      size: 25,
      minecraftVersion: '1.21.4',
    });
  });

  it('loads decoded resource bodies through Rust', async () => {
    const { getSpigotResourceBody } = await import('@/lib/plugin-commands');
    tauriInvokeMock.mockResolvedValueOnce('Description');
    expect(await getSpigotResourceBody(123)).toBe('Description');
    expect(tauriInvokeMock).toHaveBeenCalledWith('get_plugin_spiget_body', { resourceId: 123 });
  });
});
