import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: vi.fn(),
}));

describe('health-check-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
  });

  describe('pingServer', () => {
    // Host validation and ping packet encoding are tested in Rust (src-tauri/src/commands/health_check.rs).
    it('forwards host and port to ping_server and returns the IPC result', async () => {
      const pingResult = {
        online: true,
        latency_ms: 42,
        players_online: 5,
        players_max: 20,
        version: '1.21.4',
        motd: 'A Minecraft Server',
      };
      tauriInvokeMock.mockResolvedValueOnce(pingResult);
      const { pingServer } = await import('@/lib/health-check-commands');
      const result = await pingServer('mc.example.com', 25565);
      expect(tauriInvokeMock).toHaveBeenCalledWith('ping_server', {
        host: 'mc.example.com',
        port: 25565,
      });
      expect(result).toEqual(pingResult);
    });
  });
});
