import { useEffect } from 'react';
import { getAppSettings, onConfigChange } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';
import { isGlassSupported, setLiquidGlassEffect } from '../../lib/liquid-glass-commands';

interface UseLiquidGlassSyncOptions {
  liquidGlassEnabled: boolean;
  setLiquidGlassEnabled: (enabled: boolean) => void;
}

export function useLiquidGlassSync({
  liquidGlassEnabled,
  setLiquidGlassEnabled,
}: UseLiquidGlassSyncOptions) {
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

  useEffect(() => {
    void (async () => {
      try {
        const supported = await isGlassSupported();
        document.body.classList.toggle('liquid-glass-active', supported && liquidGlassEnabled);
        if (!supported) return;
        await setLiquidGlassEffect({ enabled: liquidGlassEnabled });
      } catch (error) {
        logError('Failed to apply liquid glass effect', error, { liquidGlassEnabled });
      }
    })();
  }, [liquidGlassEnabled]);
}
