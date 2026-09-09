import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();
const tauriListenMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: tauriListenMock,
}));

describe('ngrok-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
    tauriListenMock.mockReset();
  });

  it('starts ngrok without sending the token through IPC', async () => {
    tauriInvokeMock.mockResolvedValueOnce(undefined);
    const { startNgrok } = await import('@/lib/ngrok-commands');
    await startNgrok('tcp', 25565, 'server-1');
    expect(tauriInvokeMock).toHaveBeenCalledWith('start_ngrok', {
      protocol: 'tcp',
      port: 25565,
      serverId: 'server-1',
    });
  });

  it('invokes stop_ngrok with empty args', async () => {
    tauriInvokeMock.mockResolvedValueOnce(undefined);
    const { stopNgrok } = await import('@/lib/ngrok-commands');
    await stopNgrok();
    expect(tauriInvokeMock).toHaveBeenCalledWith('stop_ngrok', {});
  });

  it('invokes download_ngrok and returns installed binary path', async () => {
    tauriInvokeMock.mockResolvedValueOnce('/usr/local/bin/ngrok');
    const { downloadNgrok } = await import('@/lib/ngrok-commands');
    await expect(downloadNgrok()).resolves.toBe('/usr/local/bin/ngrok');
    expect(tauriInvokeMock).toHaveBeenCalledWith('download_ngrok');
  });

  it('maps the installed state command', async () => {
    tauriInvokeMock.mockResolvedValueOnce(true);
    const { isNgrokInstalled } = await import('@/lib/ngrok-commands');
    await expect(isNgrokInstalled()).resolves.toBe(true);
    expect(tauriInvokeMock).toHaveBeenCalledWith('is_ngrok_installed');
  });

  it('uses a status-only credential read', async () => {
    tauriInvokeMock.mockResolvedValueOnce({ configured: true });
    const { getNgrokTokenStatus, hasNgrokToken } = await import('@/lib/ngrok-commands');
    await expect(getNgrokTokenStatus()).resolves.toEqual({ configured: true });
    tauriInvokeMock.mockResolvedValueOnce({ configured: false });
    await expect(hasNgrokToken()).resolves.toBe(false);
    expect(tauriInvokeMock).toHaveBeenNthCalledWith(1, 'get_ngrok_token_status', {});
    expect(tauriInvokeMock).toHaveBeenNthCalledWith(2, 'get_ngrok_token_status', {});
  });

  it('writes and clears credentials through Rust commands', async () => {
    tauriInvokeMock.mockResolvedValue(undefined);
    const { setNgrokToken, clearNgrokToken } = await import('@/lib/ngrok-commands');
    await setNgrokToken('new-token');
    await clearNgrokToken();
    expect(tauriInvokeMock).toHaveBeenNthCalledWith(1, 'set_ngrok_token', { token: 'new-token' });
    expect(tauriInvokeMock).toHaveBeenNthCalledWith(2, 'clear_ngrok_token', {});
  });

  it('registers ngrok event listeners', async () => {
    const unlistenFn = vi.fn();
    tauriListenMock.mockResolvedValueOnce(unlistenFn);
    const { onNgrokLog } = await import('@/lib/ngrok-commands');
    const callback = vi.fn();
    await expect(onNgrokLog(callback)).resolves.toBe(unlistenFn);
    expect(tauriListenMock).toHaveBeenCalledWith('ngrok-log', callback);
  });
});
