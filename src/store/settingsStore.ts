import { create } from 'zustand';

export type AppTheme = 'dark';
export type UpdateChannel = 'stable' | 'beta';

export const DEFAULT_UPDATE_CHANNEL: UpdateChannel = 'stable';

export function normalizeUpdateChannel(value: unknown): UpdateChannel {
  return value === 'beta' ? 'beta' : DEFAULT_UPDATE_CHANNEL;
}

export function normalizeAppTheme(_value: unknown): AppTheme {
  return 'dark';
}

interface SettingsStoreState {
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
  liquidGlassEnabled: boolean;
  setLiquidGlassEnabled: (enabled: boolean) => void;
  allowUnverifiedPluginDownloads: boolean;
  setAllowUnverifiedPluginDownloads: (enabled: boolean) => void;
  updateChannel: UpdateChannel;
  setUpdateChannel: (channel: UpdateChannel) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  appTheme: 'dark',
  setAppTheme: (theme) => set({ appTheme: theme }),
  liquidGlassEnabled: false,
  setLiquidGlassEnabled: (enabled) => set({ liquidGlassEnabled: enabled }),
  allowUnverifiedPluginDownloads: false,
  setAllowUnverifiedPluginDownloads: (enabled) => set({ allowUnverifiedPluginDownloads: enabled }),
  updateChannel: DEFAULT_UPDATE_CHANNEL,
  setUpdateChannel: (channel) => set({ updateChannel: normalizeUpdateChannel(channel) }),
}));
