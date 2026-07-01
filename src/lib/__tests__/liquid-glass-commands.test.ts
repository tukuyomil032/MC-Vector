import { beforeEach, describe, expect, it, vi } from 'vitest';

const isGlassSupportedMock = vi.fn();
const setLiquidGlassEffectMock = vi.fn();

vi.mock('tauri-plugin-liquid-glass-api', () => ({
  GlassMaterialVariant: { Regular: 0 },
  isGlassSupported: isGlassSupportedMock,
  setLiquidGlassEffect: setLiquidGlassEffectMock,
}));

describe('liquid-glass-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    isGlassSupportedMock.mockReset();
    setLiquidGlassEffectMock.mockReset();
  });

  describe('isGlassSupported', () => {
    it('delegates to the plugin API and returns its result', async () => {
      isGlassSupportedMock.mockResolvedValueOnce(true);
      const { isGlassSupported } = await import('../liquid-glass-commands');
      const result = await isGlassSupported();
      expect(isGlassSupportedMock).toHaveBeenCalledWith();
      expect(result).toBe(true);
    });
  });

  describe('setLiquidGlassEffect', () => {
    it('delegates to the plugin API with the given config', async () => {
      setLiquidGlassEffectMock.mockResolvedValueOnce(undefined);
      const { setLiquidGlassEffect } = await import('../liquid-glass-commands');
      await setLiquidGlassEffect({ enabled: true });
      expect(setLiquidGlassEffectMock).toHaveBeenCalledWith({ enabled: true });
    });

    it('propagates errors from the plugin API', async () => {
      setLiquidGlassEffectMock.mockRejectedValueOnce(new Error('native call failed'));
      const { setLiquidGlassEffect } = await import('../liquid-glass-commands');
      await expect(setLiquidGlassEffect({ enabled: false })).rejects.toThrow('native call failed');
    });
  });
});
