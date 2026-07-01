import { create } from 'zustand';

export type AppTheme = 'dark';

export function normalizeAppTheme(_value: unknown): AppTheme {
  return 'dark';
}

interface SettingsStoreState {
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
  liquidGlassEnabled: boolean;
  setLiquidGlassEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  appTheme: 'dark',
  setAppTheme: (theme) => set({ appTheme: theme }),
  liquidGlassEnabled: false,
  setLiquidGlassEnabled: (enabled) => set({ liquidGlassEnabled: enabled }),
}));
