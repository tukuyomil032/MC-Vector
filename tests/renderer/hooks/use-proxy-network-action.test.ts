import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Translate } from '@/i18n';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import { useProxyNetworkAction } from '@/renderer/hooks/use-proxy-network-action';
import type { ProxyNetworkConfig } from '@/renderer/components/ProxySetupView';

const { configureProxyNetworkMock } = vi.hoisted(() => ({
  configureProxyNetworkMock: vi.fn(),
}));
vi.mock('@/lib/properties-commands', () => ({ configureProxyNetwork: configureProxyNetworkMock }));

beforeEach(() => {
  configureProxyNetworkMock.mockReset();
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
});
