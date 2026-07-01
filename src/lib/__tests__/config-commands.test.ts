import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const setMock = vi.fn();
const saveMock = vi.fn();
const entriesMock = vi.fn();
const onKeyChangeMock = vi.fn();

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({
    get: getMock,
    set: setMock,
    save: saveMock,
    entries: entriesMock,
    onKeyChange: onKeyChangeMock,
  }),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/home/user/.local/share/mc-vector'),
}));

describe('config-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    getMock.mockReset();
    setMock.mockReset();
    saveMock.mockReset();
    entriesMock.mockReset();
    onKeyChangeMock.mockReset();
  });

  describe('getConfig', () => {
    it('returns value when key exists', async () => {
      getMock.mockResolvedValueOnce('dark');
      const { getConfig } = await import('../config-commands');
      const result = await getConfig<string>('theme');
      expect(getMock).toHaveBeenCalledWith('theme');
      expect(result).toBe('dark');
    });

    it('returns null when key does not exist', async () => {
      getMock.mockResolvedValueOnce(null);
      const { getConfig } = await import('../config-commands');
      const result = await getConfig<string>('missing-key');
      expect(result).toBeNull();
    });
  });

  describe('setConfig', () => {
    it('sets value and saves to store', async () => {
      const { setConfig } = await import('../config-commands');
      await setConfig('theme', 'light');
      expect(setMock).toHaveBeenCalledWith('theme', 'light');
      expect(saveMock).toHaveBeenCalled();
    });
  });

  describe('getAllConfig', () => {
    it('converts entries to a Record', async () => {
      entriesMock.mockResolvedValueOnce([
        ['theme', 'dark'],
        ['locale', 'ja'],
      ]);
      const { getAllConfig } = await import('../config-commands');
      const result = await getAllConfig();
      expect(entriesMock).toHaveBeenCalled();
      expect(result).toEqual({ theme: 'dark', locale: 'ja' });
    });

    it('returns empty object when store has no entries', async () => {
      entriesMock.mockResolvedValueOnce([]);
      const { getAllConfig } = await import('../config-commands');
      const result = await getAllConfig();
      expect(result).toEqual({});
    });
  });

  describe('onConfigChange', () => {
    it('returns unsubscribe function from onKeyChange', async () => {
      const unsubscribe = vi.fn();
      onKeyChangeMock.mockResolvedValueOnce(unsubscribe);
      const { onConfigChange } = await import('../config-commands');
      const callback = vi.fn();
      const result = await onConfigChange('theme', callback);
      expect(onKeyChangeMock).toHaveBeenCalledWith('theme', callback);
      expect(result).toBe(unsubscribe);
    });
  });

  describe('getAppSettings', () => {
    it('returns theme, locale, and liquidGlassEnabled from store', async () => {
      getMock.mockResolvedValueOnce('dark').mockResolvedValueOnce('ja').mockResolvedValueOnce(true);
      const { getAppSettings } = await import('../config-commands');
      const result = await getAppSettings();
      expect(result).toEqual({ theme: 'dark', locale: 'ja', liquidGlassEnabled: true });
    });

    it('returns undefined fields when values are not set', async () => {
      getMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      const { getAppSettings } = await import('../config-commands');
      const result = await getAppSettings();
      expect(result.theme).toBeUndefined();
      expect(result.locale).toBeUndefined();
      expect(result.liquidGlassEnabled).toBeUndefined();
    });
  });

  describe('saveAppSettings', () => {
    it('saves each non-undefined setting and calls save', async () => {
      const { saveAppSettings } = await import('../config-commands');
      await saveAppSettings({ theme: 'dark', locale: 'ja', liquidGlassEnabled: true });
      expect(setMock).toHaveBeenCalledWith('theme', 'dark');
      expect(setMock).toHaveBeenCalledWith('locale', 'ja');
      expect(setMock).toHaveBeenCalledWith('liquidGlassEnabled', true);
      expect(saveMock).toHaveBeenCalled();
    });

    it('skips undefined values', async () => {
      const { saveAppSettings } = await import('../config-commands');
      await saveAppSettings({ theme: 'dark', locale: undefined });
      expect(setMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith('theme', 'dark');
    });
  });

  describe('getServerRoot', () => {
    it('returns appDataDir joined with /servers', async () => {
      const { getServerRoot } = await import('../config-commands');
      const result = await getServerRoot();
      expect(result).toBe('/home/user/.local/share/mc-vector/servers');
    });
  });
});
