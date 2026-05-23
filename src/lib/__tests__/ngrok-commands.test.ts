import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();
const tauriListenMock = vi.fn();
const getMock = vi.fn();
const setMock = vi.fn();
const deleteMock = vi.fn();
const saveMock = vi.fn();

vi.mock('../tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: tauriListenMock,
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({
    get: getMock,
    set: setMock,
    delete: deleteMock,
    save: saveMock,
  }),
}));

describe('ngrok-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
    tauriListenMock.mockReset();
    getMock.mockReset();
    setMock.mockReset();
    deleteMock.mockReset();
    saveMock.mockReset();
  });

  describe('startNgrok', () => {
    it('invokes start_ngrok with correct args', async () => {
      tauriInvokeMock.mockResolvedValueOnce(undefined);
      const { startNgrok } = await import('../ngrok-commands');
      await startNgrok('/usr/local/bin/ngrok', 'tcp', 25565, 'token123', 'server-1');
      expect(tauriInvokeMock).toHaveBeenCalledWith('start_ngrok', {
        ngrokPath: '/usr/local/bin/ngrok',
        protocol: 'tcp',
        port: 25565,
        authtoken: 'token123',
        serverId: 'server-1',
      });
    });
  });

  describe('stopNgrok', () => {
    it('invokes stop_ngrok with empty args', async () => {
      tauriInvokeMock.mockResolvedValueOnce(undefined);
      const { stopNgrok } = await import('../ngrok-commands');
      await stopNgrok();
      expect(tauriInvokeMock).toHaveBeenCalledWith('stop_ngrok', {});
    });
  });

  describe('downloadNgrok', () => {
    it('invokes download_ngrok and returns installed binary path', async () => {
      tauriInvokeMock.mockResolvedValueOnce('/usr/local/bin/ngrok');
      const { downloadNgrok } = await import('../ngrok-commands');
      const result = await downloadNgrok('/usr/local/bin');
      expect(tauriInvokeMock).toHaveBeenCalledWith('download_ngrok', { destDir: '/usr/local/bin' });
      expect(result).toBe('/usr/local/bin/ngrok');
    });
  });

  describe('isNgrokInstalled', () => {
    it('returns true when ngrok binary exists', async () => {
      tauriInvokeMock.mockResolvedValueOnce(true);
      const { isNgrokInstalled } = await import('../ngrok-commands');
      const result = await isNgrokInstalled('/usr/local/bin/ngrok');
      expect(tauriInvokeMock).toHaveBeenCalledWith('is_ngrok_installed', {
        path: '/usr/local/bin/ngrok',
      });
      expect(result).toBe(true);
    });

    it('returns false when ngrok binary is missing', async () => {
      tauriInvokeMock.mockResolvedValueOnce(false);
      const { isNgrokInstalled } = await import('../ngrok-commands');
      const result = await isNgrokInstalled('/nonexistent/ngrok');
      expect(result).toBe(false);
    });
  });

  describe('getNgrokToken', () => {
    it('returns stored token string', async () => {
      getMock.mockResolvedValueOnce('my-auth-token');
      const { getNgrokToken } = await import('../ngrok-commands');
      const result = await getNgrokToken();
      expect(getMock).toHaveBeenCalledWith('ngrokToken');
      expect(result).toBe('my-auth-token');
    });

    it('returns null when no token is stored', async () => {
      getMock.mockResolvedValueOnce(undefined);
      const { getNgrokToken } = await import('../ngrok-commands');
      const result = await getNgrokToken();
      expect(result).toBeNull();
    });
  });

  describe('setNgrokToken', () => {
    it('sets token and saves store', async () => {
      setMock.mockResolvedValueOnce(undefined);
      saveMock.mockResolvedValueOnce(undefined);
      const { setNgrokToken } = await import('../ngrok-commands');
      await setNgrokToken('new-token');
      expect(setMock).toHaveBeenCalledWith('ngrokToken', 'new-token');
      expect(saveMock).toHaveBeenCalled();
    });
  });

  describe('clearNgrokToken', () => {
    it('deletes token key and saves store', async () => {
      deleteMock.mockResolvedValueOnce(undefined);
      saveMock.mockResolvedValueOnce(undefined);
      const { clearNgrokToken } = await import('../ngrok-commands');
      await clearNgrokToken();
      expect(deleteMock).toHaveBeenCalledWith('ngrokToken');
      expect(saveMock).toHaveBeenCalled();
    });
  });

  describe('hasNgrokToken', () => {
    it('returns true when token exists in store', async () => {
      getMock.mockResolvedValueOnce('some-token');
      const { hasNgrokToken } = await import('../ngrok-commands');
      const result = await hasNgrokToken();
      expect(result).toBe(true);
    });

    it('returns false when no token in store', async () => {
      getMock.mockResolvedValueOnce(undefined);
      const { hasNgrokToken } = await import('../ngrok-commands');
      const result = await hasNgrokToken();
      expect(result).toBe(false);
    });
  });

  describe('onNgrokLog', () => {
    it('registers listener for ngrok-log event and returns unlisten fn', async () => {
      const unlistenFn = vi.fn();
      tauriListenMock.mockResolvedValueOnce(unlistenFn);
      const { onNgrokLog } = await import('../ngrok-commands');
      const callback = vi.fn();
      const unlisten = await onNgrokLog(callback);
      expect(tauriListenMock).toHaveBeenCalledWith('ngrok-log', callback);
      expect(unlisten).toBe(unlistenFn);
    });
  });

  describe('onNgrokStatusChange', () => {
    it('registers listener for ngrok-status-change event and returns unlisten fn', async () => {
      const unlistenFn = vi.fn();
      tauriListenMock.mockResolvedValueOnce(unlistenFn);
      const { onNgrokStatusChange } = await import('../ngrok-commands');
      const callback = vi.fn();
      const unlisten = await onNgrokStatusChange(callback);
      expect(tauriListenMock).toHaveBeenCalledWith('ngrok-status-change', callback);
      expect(unlisten).toBe(unlistenFn);
    });
  });
});
