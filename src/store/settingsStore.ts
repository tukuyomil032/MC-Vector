import { create } from 'zustand';

export type AppTheme = 'light' | 'dark' | 'system';

export function normalizeAppTheme(value: unknown): AppTheme {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'dark';
}

interface SettingsStoreState {
  appTheme: AppTheme;
  systemPrefersDark: boolean;
  setAppTheme: (theme: AppTheme) => void;
  setSystemPrefersDark: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  appTheme: 'light',
  systemPrefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  setAppTheme: (theme) => set({ appTheme: theme }),
  setSystemPrefersDark: (value) => set({ systemPrefersDark: value }),
}));
