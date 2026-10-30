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

describe('Modrinth metadata IPC contract', () => {
  it('passes the selected Minecraft version so Rust owns version filtering and status', async () => {
    const { searchModrinth } = await import('@/lib/plugin-commands');
    const payload = {
      hits: [
        {
          slug: 'plugin',
          title: 'Plugin',
          compatibility: 'compatible',
          supportedVersions: ['1.21.4'],
        },
      ],
      total_hits: 1,
    };
    tauriInvokeMock.mockResolvedValueOnce(payload);
    expect(
      await searchModrinth('plugin', '[["project_type:plugin"]]', 0, 25, undefined, '1.21.4'),
    ).toBe(payload);
    expect(tauriInvokeMock).toHaveBeenCalledWith('search_plugin_modrinth', {
      query: 'plugin',
      facets: '[["project_type:plugin"]]',
      offset: 0,
      limit: 25,
      minecraftVersion: '1.21.4',
    });
  });
  it('sends identifiers and filters while preserving provider DTOs', async () => {
    const commands = await import('@/lib/plugin-commands');
    const search = { hits: [{ slug: 'plugin', title: 'Plugin' }], total_hits: 1 };
    tauriInvokeMock.mockResolvedValueOnce(search);
    expect(await commands.searchModrinth('plugin', '[[]]', 20, 10)).toBe(search);
    expect(tauriInvokeMock).toHaveBeenLastCalledWith('search_plugin_modrinth', {
      query: 'plugin',
      facets: '[[]]',
      offset: 20,
      limit: 10,
    });
    const params = { projectId: 'project', loader: 'paper', minecraftVersion: '1.21' };
    tauriInvokeMock.mockResolvedValueOnce(null);
    expect(await commands.getCompatibleModrinthVersion(params)).toBeNull();
    expect(tauriInvokeMock).toHaveBeenLastCalledWith(
      'get_plugin_modrinth_compatible_version',
      params,
    );
  });

  it('routes version, identity and body lookups through typed commands', async () => {
    const commands = await import('@/lib/plugin-commands');
    for (const [call, command, args] of [
      [
        () => commands.getModrinthVersions('project'),
        'get_plugin_modrinth_versions',
        { projectId: 'project' },
      ],
      [
        () => commands.getModrinthVersionById('version'),
        'get_plugin_modrinth_version',
        { versionId: 'version' },
      ],
      [
        () => commands.getModrinthProjectIdentity('project'),
        'get_plugin_modrinth_identity',
        { projectId: 'project' },
      ],
      [
        () => commands.getModrinthProjectBody('project'),
        'get_plugin_modrinth_body',
        { projectId: 'project' },
      ],
    ] as const) {
      await call();
      expect(tauriInvokeMock).toHaveBeenLastCalledWith(command, args);
    }
  });
});

describe('explicit real Tauri debug fixture', () => {
  it('keeps debug search and compatibility metadata deterministic', async () => {
    vi.stubEnv('VITE_MC_VECTOR_E2E', '1');
    vi.stubEnv('VITE_MC_VECTOR_E2E_BUILD', 'debug');
    const commands = await import('@/lib/plugin-commands');
    const search = await commands.searchModrinth('', '');
    expect(search.hits[0].project_id).toBe('e2e-verified-plugin');
    const version = await commands.getCompatibleModrinthVersion({
      projectId: 'e2e-verified-plugin',
      loader: 'paper',
      minecraftVersion: '1.21',
    });
    expect(version?.gameVersions).toEqual(['1.21']);
    expect(tauriInvokeMock).not.toHaveBeenCalled();
  });

  it('uses real provider IPC for release builds even with the E2E flag', async () => {
    vi.stubEnv('VITE_MC_VECTOR_E2E', '1');
    vi.stubEnv('VITE_MC_VECTOR_E2E_BUILD', 'release');
    const { searchModrinth } = await import('@/lib/plugin-commands');
    await searchModrinth('', '');
    expect(tauriInvokeMock).toHaveBeenCalledWith('search_plugin_modrinth', {
      query: '',
      facets: '',
      offset: 0,
      limit: 20,
    });
  });
});
