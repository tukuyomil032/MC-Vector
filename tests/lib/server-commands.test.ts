import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();
const appDataDirMock = vi.fn();

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: appDataDirMock,
}));

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('server-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
    appDataDirMock.mockReset();
    appDataDirMock.mockResolvedValue('/app-data');
  });

  it('startServer invokes start_server with correct args (no jvmExtraArgs)', async () => {
    tauriInvokeMock.mockResolvedValueOnce(undefined);

    const { startServer } = await import('@/lib/server-commands');

    await startServer('server-1', 'C:\\Java\\bin\\java.exe', 4096, 'server.jar');

    expect(tauriInvokeMock).toHaveBeenCalledWith('start_server', {
      serverId: 'server-1',
      javaPath: 'C:\\Java\\bin\\java.exe',
      memory: 4096,
      jarFile: 'server.jar',
      jvmExtraArgs: null,
    });
  });

  it('startServer passes jvmExtraArgs when provided', async () => {
    tauriInvokeMock.mockResolvedValueOnce(undefined);

    const { startServer } = await import('@/lib/server-commands');

    await startServer('server-1', '/usr/bin/java', 2048, 'server.jar', '-XX:+UseG1GC');

    expect(tauriInvokeMock).toHaveBeenCalledWith('start_server', {
      serverId: 'server-1',
      javaPath: '/usr/bin/java',
      memory: 2048,
      jarFile: 'server.jar',
      jvmExtraArgs: '-XX:+UseG1GC',
    });
  });

  it('stopServer invokes stop_server with serverId', async () => {
    tauriInvokeMock.mockResolvedValueOnce(undefined);

    const { stopServer } = await import('@/lib/server-commands');

    await stopServer('server-1');

    expect(tauriInvokeMock).toHaveBeenCalledWith('stop_server', {
      serverId: 'server-1',
    });
  });

  it('sendCommand invokes send_command with serverId and command', async () => {
    tauriInvokeMock.mockResolvedValueOnce(undefined);

    const { sendCommand } = await import('@/lib/server-commands');

    await sendCommand('server-1', 'stop');

    expect(tauriInvokeMock).toHaveBeenCalledWith('send_command', {
      serverId: 'server-1',
      command: 'stop',
    });
  });

  it('isServerRunning invokes is_server_running and returns boolean', async () => {
    tauriInvokeMock.mockResolvedValueOnce(true);

    const { isServerRunning } = await import('@/lib/server-commands');

    const result = await isServerRunning('server-1');

    expect(tauriInvokeMock).toHaveBeenCalledWith('is_server_running', {
      serverId: 'server-1',
    });
    expect(result).toBe(true);
  });
});
