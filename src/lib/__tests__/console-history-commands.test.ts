import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const setMock = vi.fn();
const saveMock = vi.fn();

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({
    get: getMock,
    set: setMock,
    save: saveMock,
  }),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/mock/data'),
}));

describe('console-history-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    getMock.mockReset();
    setMock.mockReset();
    saveMock.mockReset();
  });

  describe('loadCommandHistory', () => {
    it('returns stored history for the given serverId', async () => {
      const history = ['op list', 'say hello'];
      getMock.mockResolvedValueOnce(history);
      const { loadCommandHistory } = await import('../console-history-commands');
      const result = await loadCommandHistory('server-1');
      expect(getMock).toHaveBeenCalledWith('console-history:server-1');
      expect(result).toEqual(history);
    });

    it('returns empty array when no history is stored', async () => {
      getMock.mockResolvedValueOnce(null);
      const { loadCommandHistory } = await import('../console-history-commands');
      const result = await loadCommandHistory('server-1');
      expect(result).toEqual([]);
    });
  });

  describe('saveCommandHistory', () => {
    it('saves history with the correct prefixed key', async () => {
      const history = ['op list', 'say hello'];
      const { saveCommandHistory } = await import('../console-history-commands');
      await saveCommandHistory('server-1', history);
      expect(setMock).toHaveBeenCalledWith('console-history:server-1', history);
      expect(saveMock).toHaveBeenCalled();
    });

    it('trims history to the last 200 entries when over limit', async () => {
      const history = Array.from({ length: 250 }, (_, i) => `command-${i}`);
      const { saveCommandHistory } = await import('../console-history-commands');
      await saveCommandHistory('server-1', history);
      const saved = setMock.mock.calls[0][1] as string[];
      expect(saved).toHaveLength(200);
      expect(saved[0]).toBe('command-50');
      expect(saved[199]).toBe('command-249');
    });

    it('does not trim history that is within the 200-entry limit', async () => {
      const history = Array.from({ length: 100 }, (_, i) => `cmd-${i}`);
      const { saveCommandHistory } = await import('../console-history-commands');
      await saveCommandHistory('server-2', history);
      const saved = setMock.mock.calls[0][1] as string[];
      expect(saved).toHaveLength(100);
    });
  });
});
