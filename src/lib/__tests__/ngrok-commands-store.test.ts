import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const setMock = vi.fn();
const saveMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({
    get: getMock,
    set: setMock,
    save: saveMock,
    delete: deleteMock,
  }),
}));

vi.mock('../tauri-api', () => ({
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}));

describe('ngrok-commands (store)', () => {
  beforeEach(() => {
    vi.resetModules();
    getMock.mockReset();
    setMock.mockReset();
    saveMock.mockReset();
    deleteMock.mockReset();
  });

  describe('getNgrokToken', () => {
    it('returns token string when stored', async () => {
      getMock.mockResolvedValueOnce('ngrok-token-abc');
      const { getNgrokToken } = await import('../ngrok-commands');
      const result = await getNgrokToken();
      expect(getMock).toHaveBeenCalledWith('ngrokToken');
      expect(result).toBe('ngrok-token-abc');
    });

    it('returns null when no token is stored', async () => {
      getMock.mockResolvedValueOnce(null);
      const { getNgrokToken } = await import('../ngrok-commands');
      const result = await getNgrokToken();
      expect(result).toBeNull();
    });
  });

  describe('setNgrokToken', () => {
    it('sets token and saves to store', async () => {
      const { setNgrokToken } = await import('../ngrok-commands');
      await setNgrokToken('my-secret-token');
      expect(setMock).toHaveBeenCalledWith('ngrokToken', 'my-secret-token');
      expect(saveMock).toHaveBeenCalled();
    });
  });

  describe('clearNgrokToken', () => {
    it('deletes ngrokToken key and saves', async () => {
      const { clearNgrokToken } = await import('../ngrok-commands');
      await clearNgrokToken();
      expect(deleteMock).toHaveBeenCalledWith('ngrokToken');
      expect(saveMock).toHaveBeenCalled();
    });
  });

  describe('hasNgrokToken', () => {
    it('returns true when token exists', async () => {
      getMock.mockResolvedValueOnce('some-token');
      const { hasNgrokToken } = await import('../ngrok-commands');
      const result = await hasNgrokToken();
      expect(result).toBe(true);
    });

    it('returns false when no token exists', async () => {
      getMock.mockResolvedValueOnce(null);
      const { hasNgrokToken } = await import('../ngrok-commands');
      const result = await hasNgrokToken();
      expect(result).toBe(false);
    });
  });
});
