import { create } from 'zustand';

export type AppTheme = 'dark';

export function normalizeAppTheme(_value: unknown): AppTheme {
  return 'dark';
}

interface SettingsStoreState {
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  appTheme: 'dark',
  setAppTheme: (theme) => set({ appTheme: theme }),
}));
