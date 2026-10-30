import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();
vi.mock('@/lib/tauri-api', () => ({ tauriInvoke: tauriInvokeMock }));

beforeEach(() => {
  vi.resetModules();
  tauriInvokeMock.mockReset();
});

describe('server properties commands', () => {
  it('loads a server property map by managed server ID', async () => {
    tauriInvokeMock.mockResolvedValue({ 'online-mode': true, 'server-port': 25565 });
    const { getServerProperties } = await import('@/lib/properties-commands');

    await expect(getServerProperties('server-1')).resolves.toEqual({
      'online-mode': true,
      'server-port': 25565,
    });
    expect(tauriInvokeMock).toHaveBeenCalledWith('get_server_properties', {
      serverId: 'server-1',
    });
  });

  it('saves only typed property values through Rust', async () => {
    tauriInvokeMock.mockResolvedValue(25566);
    const { saveServerProperties } = await import('@/lib/properties-commands');
    const updates = { motd: 'A server', 'server-port': 25566, 'online-mode': false };

    await expect(saveServerProperties('server-1', updates)).resolves.toBe(25566);
    expect(tauriInvokeMock).toHaveBeenCalledWith('save_server_properties', {
      serverId: 'server-1',
      updates,
    });
  });

  it('applies proxy changes with one Rust command', async () => {
    tauriInvokeMock.mockResolvedValue([{ serverId: 'server-1', port: 25566 }]);
    const { configureProxyNetwork } = await import('@/lib/properties-commands');
    const request = {
      proxySoftware: 'Velocity',
      proxyPort: 25577,
      backendServerIds: ['server-1'],
    };

    await expect(configureProxyNetwork(request)).resolves.toEqual([
      { serverId: 'server-1', port: 25566 },
    ]);
    expect(tauriInvokeMock).toHaveBeenCalledWith('configure_proxy_network', { request });
  });
});
