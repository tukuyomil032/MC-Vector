import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { tauriInvokeMock, tauriListenMock } = vi.hoisted(() => ({
  tauriInvokeMock: vi.fn(),
  tauriListenMock: vi.fn(),
}));

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: tauriListenMock,
}));

beforeEach(() => {
  vi.resetModules();
  tauriInvokeMock.mockReset();
  tauriListenMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Rust-owned plugin installer IPC contract', () => {
  it('prepares a plan from provider identifiers and optional replacement file only', async () => {
    const { preparePluginInstall } = await import('@/lib/plugin-installer-commands');
    const preview = { token: 'plan-token' };
    tauriInvokeMock.mockResolvedValueOnce(preview);

    expect(
      await preparePluginInstall(
        'server-1',
        { provider: 'hangar', owner: 'Example', slug: 'wireless-redstone' },
        'WirelessRedstone-1.0.jar.disabled',
      ),
    ).toBe(preview);
    expect(tauriInvokeMock).toHaveBeenCalledWith('prepare_plugin_install', {
      request: {
        serverId: 'server-1',
        project: { provider: 'hangar', owner: 'Example', slug: 'wireless-redstone' },
        replaceFileName: 'WirelessRedstone-1.0.jar.disabled',
      },
    });
    expect(JSON.stringify(tauriInvokeMock.mock.calls[0])).not.toMatch(
      /"(?:url|checksum|relativePath|eventId)"\s*:/i,
    );
  });

  it('executes only with a Rust-issued token and explicit dependency confirmations', async () => {
    const { executePluginInstall } = await import('@/lib/plugin-installer-commands');
    const result = { serverId: 'server-1', installedFileNames: ['plugin.jar'] };
    tauriInvokeMock.mockResolvedValueOnce(result);

    expect(await executePluginInstall('plan-token', ['modrinth:library:1'])).toBe(result);
    expect(tauriInvokeMock).toHaveBeenCalledWith('execute_plugin_install', {
      request: {
        token: 'plan-token',
        confirmedDependencyIds: ['modrinth:library:1'],
      },
    });
    expect(JSON.stringify(tauriInvokeMock.mock.calls[0])).not.toMatch(
      /"(?:url|checksum|relativePath|eventId)"\s*:/i,
    );
  });

  it('subscribes to progress under the plan token and exposes Rust-owned mutations', async () => {
    const { onPluginInstallProgress, toggleInstalledPlugin, uninstallInstalledPlugin } =
      await import('@/lib/plugin-installer-commands');
    const unlisten = vi.fn();
    tauriListenMock.mockResolvedValueOnce(unlisten);
    const onProgress = vi.fn();
    expect(await onPluginInstallProgress('plan-token', onProgress)).toBe(unlisten);
    expect(tauriListenMock).toHaveBeenCalledWith('download-progress-plan-token', onProgress);

    await toggleInstalledPlugin('server-1', 'plugin.jar');
    expect(tauriInvokeMock).toHaveBeenLastCalledWith('toggle_installed_plugin', {
      request: { serverId: 'server-1', fileName: 'plugin.jar' },
    });

    await uninstallInstalledPlugin('server-1', 'plugin.jar.disabled');
    expect(tauriInvokeMock).toHaveBeenLastCalledWith('uninstall_installed_plugin', {
      request: { serverId: 'server-1', fileName: 'plugin.jar.disabled' },
    });
  });
});
