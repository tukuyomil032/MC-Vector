import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAppSettingsMock = vi.fn();
const onConfigChangeMock = vi.fn();
const isGlassSupportedMock = vi.fn();
const setLiquidGlassEffectMock = vi.fn();
const logErrorMock = vi.fn();

vi.mock('../../../lib/config-commands', () => ({
  getAppSettings: getAppSettingsMock,
  onConfigChange: onConfigChangeMock,
}));

vi.mock('../../../lib/liquid-glass-commands', () => ({
  isGlassSupported: isGlassSupportedMock,
  setLiquidGlassEffect: setLiquidGlassEffectMock,
}));

vi.mock('../../../lib/error-utils', () => ({
  logError: logErrorMock,
}));

describe('useLiquidGlassSync', () => {
  beforeEach(() => {
    vi.resetModules();
    getAppSettingsMock.mockReset().mockResolvedValue({});
    onConfigChangeMock.mockReset().mockResolvedValue(() => {});
    isGlassSupportedMock.mockReset();
    setLiquidGlassEffectMock.mockReset().mockResolvedValue(undefined);
    logErrorMock.mockReset();
  });

  it('applies the effect when the platform supports it and the toggle is on', async () => {
    isGlassSupportedMock.mockResolvedValue(true);
    const { useLiquidGlassSync } = await import('../use-liquid-glass-sync');
    const setLiquidGlassEnabled = vi.fn();

    renderHook(() => useLiquidGlassSync({ liquidGlassEnabled: true, setLiquidGlassEnabled }));

    await waitFor(() => {
      expect(setLiquidGlassEffectMock).toHaveBeenCalledWith({ enabled: true });
    });
  });

  it('does not apply the effect when the platform does not support it', async () => {
    isGlassSupportedMock.mockResolvedValue(false);
    const { useLiquidGlassSync } = await import('../use-liquid-glass-sync');
    const setLiquidGlassEnabled = vi.fn();

    renderHook(() => useLiquidGlassSync({ liquidGlassEnabled: true, setLiquidGlassEnabled }));

    await waitFor(() => {
      expect(isGlassSupportedMock).toHaveBeenCalled();
    });
    expect(setLiquidGlassEffectMock).not.toHaveBeenCalled();
  });

  it('re-applies the effect when liquidGlassEnabled changes', async () => {
    isGlassSupportedMock.mockResolvedValue(true);
    const { useLiquidGlassSync } = await import('../use-liquid-glass-sync');
    const setLiquidGlassEnabled = vi.fn();

    const { rerender } = renderHook(
      ({ enabled }) => useLiquidGlassSync({ liquidGlassEnabled: enabled, setLiquidGlassEnabled }),
      { initialProps: { enabled: false } },
    );

    await waitFor(() => {
      expect(setLiquidGlassEffectMock).toHaveBeenCalledWith({ enabled: false });
    });

    rerender({ enabled: true });

    await waitFor(() => {
      expect(setLiquidGlassEffectMock).toHaveBeenCalledWith({ enabled: true });
    });
  });

  it('logs an error when applying the effect fails', async () => {
    isGlassSupportedMock.mockResolvedValue(true);
    setLiquidGlassEffectMock.mockRejectedValue(new Error('native call failed'));
    const { useLiquidGlassSync } = await import('../use-liquid-glass-sync');
    const setLiquidGlassEnabled = vi.fn();

    renderHook(() => useLiquidGlassSync({ liquidGlassEnabled: true, setLiquidGlassEnabled }));

    await waitFor(() => {
      expect(logErrorMock).toHaveBeenCalledWith(
        'Failed to apply liquid glass effect',
        expect.any(Error),
        { liquidGlassEnabled: true },
      );
    });
  });
});
