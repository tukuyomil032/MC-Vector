import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Translate } from '@/i18n';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import { useProxyNetworkAction } from '@/renderer/hooks/use-proxy-network-action';
import type { ProxyNetworkConfig } from '@/renderer/components/ProxySetupView';

const { askMock, configureProxyNetworkMock } = vi.hoisted(() => ({
  askMock: vi.fn(),
  configureProxyNetworkMock: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: askMock }));
vi.mock('@/lib/properties-commands', () => ({ configureProxyNetwork: configureProxyNetworkMock }));

beforeEach(() => {
  askMock.mockReset();
  configureProxyNetworkMock.mockReset();
  askMock.mockResolvedValue(true);
});

describe('useProxyNetworkAction', () => {
  it('submits the confirmed proxy setup once and refreshes in-memory backend ports', async () => {
    const updatedBackendPorts = [{ serverId: 'backend-1', port: 25566 }];
    configureProxyNetworkMock.mockResolvedValue(updatedBackendPorts);
    const setServers = vi.fn();
    const showToast = vi.fn();
    const translate = ((key: string) => key) as Translate;
    const config: ProxyNetworkConfig = {
      proxySoftware: 'Velocity',
      proxyPort: 25577,
      backendServerIds: ['backend-1'],
    };
    const { result } = renderHook(() =>
      useProxyNetworkAction({ setServers, showToast, t: translate }),
    );

    await act(async () => {
      await result.current.handleBuildProxyNetwork(config);
    });

    expect(askMock).toHaveBeenCalledOnce();
    expect(configureProxyNetworkMock).toHaveBeenCalledWith(config);
    expect(showToast).toHaveBeenCalledWith('proxy.settingsUpdated', 'success');
    const update = setServers.mock.calls[0][0] as (servers: MinecraftServer[]) => MinecraftServer[];
    const servers = [
      { id: 'backend-1', port: 25565, status: 'offline' },
      { id: 'other', port: 25570, status: 'online' },
    ] as MinecraftServer[];
    expect(update(servers)).toEqual([
      { id: 'backend-1', port: 25566, status: 'offline' },
      { id: 'other', port: 25570, status: 'online' },
    ]);
  });

  it('does not call Rust or change state when the user cancels confirmation', async () => {
    askMock.mockResolvedValue(false);
    const setServers = vi.fn();
    const showToast = vi.fn();
    const translate = ((key: string) => key) as Translate;
    const { result } = renderHook(() =>
      useProxyNetworkAction({ setServers, showToast, t: translate }),
    );

    await act(async () => {
      await result.current.handleBuildProxyNetwork({
        proxySoftware: 'Velocity',
        proxyPort: 25577,
        backendServerIds: ['backend-1'],
      });
    });

    expect(configureProxyNetworkMock).not.toHaveBeenCalled();
    expect(setServers).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
