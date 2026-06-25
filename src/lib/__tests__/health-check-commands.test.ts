import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();

vi.mock('../tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: vi.fn(),
}));

describe('health-check-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
  });

  describe('pingServer', () => {
    it('returns full ping result for an online server', async () => {
      const pingResult = {
        online: true,
        latency_ms: 42,
        players_online: 5,
        players_max: 20,
        version: '1.21.4',
        motd: 'A Minecraft Server',
      };
      tauriInvokeMock.mockResolvedValueOnce(pingResult);
      const { pingServer } = await import('../health-check-commands');
      const result = await pingServer('mc.example.com', 25565);
      expect(tauriInvokeMock).toHaveBeenCalledWith('ping_server', {
        host: 'mc.example.com',
        port: 25565,
      });
      expect(result).toEqual(pingResult);
    });

    it('returns offline result with null fields when server is unreachable', async () => {
      const offlineResult = {
        online: false,
        latency_ms: 0,
        players_online: null,
        players_max: null,
        version: null,
        motd: null,
      };
      tauriInvokeMock.mockResolvedValueOnce(offlineResult);
      const { pingServer } = await import('../health-check-commands');
      const result = await pingServer('localhost', 25565);
      expect(result.online).toBe(false);
      expect(result.players_online).toBeNull();
      expect(result.version).toBeNull();
    });
  });
});
