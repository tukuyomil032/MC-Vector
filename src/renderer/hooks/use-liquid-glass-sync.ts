import { useEffect } from 'react';
import { getAppSettings, onConfigChange } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';

interface UseLiquidGlassSyncOptions {
  setLiquidGlassEnabled: (enabled: boolean) => void;
}

export function useLiquidGlassSync({ setLiquidGlassEnabled }: UseLiquidGlassSyncOptions) {
  useEffect(() => {
    const applyLiquidGlassEnabled = (value: unknown) => {
      setLiquidGlassEnabled(value === true);
    };

    const loadAppSettings = async () => {
      try {
        const settings = await getAppSettings();
        if (settings?.liquidGlassEnabled !== undefined) {
          applyLiquidGlassEnabled(settings.liquidGlassEnabled);
        }
      } catch (error) {
        logError('Failed to load app settings for liquid glass sync', error);
      }
    };
    void loadAppSettings();

    let disposeLiquidGlassWatch: (() => void) | undefined;
    void (async () => {
      disposeLiquidGlassWatch = await onConfigChange('liquidGlassEnabled', (value) => {
        applyLiquidGlassEnabled(value);
      });
    })();

    return () => {
      disposeLiquidGlassWatch?.();
    };
  }, [setLiquidGlassEnabled]);
}
