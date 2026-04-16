import { useEffect } from 'react';
import { getAppSettings, onConfigChange, saveAppSettings } from '../../lib/config-commands';
import { type AppTheme, normalizeAppTheme } from '../../store/settingsStore';

interface UseAppThemeSyncOptions {
  setAppTheme: (theme: AppTheme) => void;
}

export function useAppThemeSync({ setAppTheme }: UseAppThemeSyncOptions) {
  useEffect(() => {
    const applyNormalizedTheme = async (value: unknown) => {
      const normalizedTheme = normalizeAppTheme(value);
      setAppTheme(normalizedTheme);

      if (value !== undefined && value !== normalizedTheme) {
        try {
          await saveAppSettings({ theme: normalizedTheme });
        } catch (persistError) {
          console.error('Failed to persist normalized app theme', persistError);
        }
      }
    };

    const loadAppSettings = async () => {
      try {
        const settings = await getAppSettings();
        if (settings?.theme !== undefined) {
          await applyNormalizedTheme(settings.theme);
        }
      } catch (error) {
        console.error('Failed to load app settings', error);
      }
    };
    void loadAppSettings();

    let disposeThemeWatch: (() => void) | undefined;
    void (async () => {
      disposeThemeWatch = await onConfigChange('theme', (value) => {
        void applyNormalizedTheme(value);
      });
    })();

    return () => {
      disposeThemeWatch?.();
    };
  }, [setAppTheme]);
}
