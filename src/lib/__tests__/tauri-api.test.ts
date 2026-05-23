import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('tauriInvoke', () => {
  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
  });

  it('allows registered command and calls invoke', async () => {
    invokeMock.mockResolvedValueOnce(true);

    const { tauriInvoke } = await import('../tauri-api');

    await expect(tauriInvoke('is_server_running', { serverId: 'test-server' })).resolves.toBe(true);

    expect(invokeMock).toHaveBeenCalledWith('is_server_running', {
      serverId: 'test-server',
    });
  });

  it("throws 'Blocked tauri command' for unregistered command", async () => {
    const { tauriInvoke } = await import('../tauri-api');

    await expect(tauriInvoke('dangerous_command', {})).rejects.toThrow(
      'Blocked tauri command: dangerous_command',
    );

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('wraps invoke error with [Tauri] prefix', async () => {
    invokeMock.mockRejectedValueOnce(new Error('process failed'));

    const { tauriInvoke } = await import('../tauri-api');

    await expect(tauriInvoke('start_server', { serverId: 'server-1' })).rejects.toThrow(
      '[Tauri] start_server failed: process failed',
    );
  });
});
