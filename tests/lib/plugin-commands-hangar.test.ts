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

describe('Hangar metadata IPC contract', () => {
  it('delegates search with the existing page size', async () => {
    const { searchHangar } = await import('@/lib/plugin-commands');
    const payload = { result: [], pagination: { count: 0 } };
    tauriInvokeMock.mockResolvedValueOnce(payload);
    expect(await searchHangar('plugin', 25)).toBe(payload);
    expect(tauriInvokeMock).toHaveBeenCalledWith('search_plugin_hangar', {
      query: 'plugin',
      offset: 25,
      limit: 25,
    });
  });

  it('delegates platform/version fallback and compatibility to Rust', async () => {
    const commands = await import('@/lib/plugin-commands');
    await commands.getHangarVersions('owner', 'slug', 'PAPER');
    expect(tauriInvokeMock).toHaveBeenLastCalledWith('get_plugin_hangar_versions', {
      owner: 'owner',
      slug: 'slug',
      platform: 'PAPER',
    });
    const params = { owner: 'owner', slug: 'slug', software: 'paper', minecraftVersion: '1.21' };
    await commands.resolveHangarDownload(params);
    expect(tauriInvokeMock).toHaveBeenLastCalledWith('resolve_plugin_hangar_download', params);
    await commands.checkHangarCompatibility(params);
    expect(tauriInvokeMock).toHaveBeenLastCalledWith('check_plugin_hangar_compatibility', params);
    await commands.getHangarProjectBody('owner', 'slug');
    expect(tauriInvokeMock).toHaveBeenLastCalledWith('get_plugin_hangar_body', {
      owner: 'owner',
      slug: 'slug',
    });
  });

  it('propagates provider metadata failures', async () => {
    const { searchHangar } = await import('@/lib/plugin-commands');
    tauriInvokeMock.mockRejectedValueOnce(new Error('Plugin API request failed'));
    await expect(searchHangar('plugin')).rejects.toThrow('Plugin API request failed');
  });
});
