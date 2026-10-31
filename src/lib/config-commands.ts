import { appDataDir } from '@tauri-apps/api/path';
import { load } from '@tauri-apps/plugin-store';
import { normalizeUpdateChannel } from '../store/settingsStore';
import type { UpdateChannel } from '../store/settingsStore';
import { tauriInvoke } from './tauri-api';

const STORE_NAME = 'config.json';

export async function getConfig<T>(key: string): Promise<T | null> {
  if (key === 'allowUnverifiedPluginDownloads') {
    return (await tauriInvoke<boolean>('get_allow_unverified_plugin_downloads')) as T;
  }
  const store = await load(STORE_NAME);
  return (await store.get<T>(key)) ?? null;
}

export async function setConfig<T>(key: string, value: T): Promise<void> {
  if (key === 'allowUnverifiedPluginDownloads') {
    if (typeof value !== 'boolean') {
      throw new Error('Plugin download policy must be a boolean');
    }
    await tauriInvoke('set_allow_unverified_plugin_downloads', { enabled: value });
    return;
  }
  const store = await load(STORE_NAME);
  await store.set(key, value);
  await store.save();
}

export async function getAllConfig(): Promise<Record<string, unknown>> {
  const store = await load(STORE_NAME);
  const entries = await store.entries();
  return Object.fromEntries(entries);
}

export async function onConfigChange(
  key: string,
  callback: (value: unknown) => void,
): Promise<() => void> {
  const store = await load(STORE_NAME);
  return store.onKeyChange(key, callback);
}

/**
 * Application settings interface.
 */
export interface AppSettings {
  /** UI theme preference */
  theme?: string;
  /** Locale/language preference (e.g., 'en', 'ja') */
  locale?: string;
  /** Whether the Liquid Glass visual effect is enabled */
  liquidGlassEnabled?: boolean;
  /** Whether plugin downloads without verification are allowed */
  allowUnverifiedPluginDownloads: boolean;
  /** Release channel used for application updates */
  updateChannel?: UpdateChannel;
  /** Allow additional dynamic settings */
  [key: string]: unknown;
}

/**
 * Get all application settings from the config store.
 * @returns Promise resolving to AppSettings object
 */
export async function getAppSettings(): Promise<AppSettings> {
  const store = await load(STORE_NAME);
  const theme = await store.get<string>('theme');
  const locale = await store.get<string>('locale');
  const liquidGlassEnabled = await store.get<boolean>('liquidGlassEnabled');
  const allowUnverifiedPluginDownloads = await tauriInvoke<boolean>(
    'get_allow_unverified_plugin_downloads',
  );
  const updateChannel = await store.get<unknown>('updateChannel');
  return {
    theme: theme ?? undefined,
    locale: locale ?? undefined,
    liquidGlassEnabled: liquidGlassEnabled ?? undefined,
    allowUnverifiedPluginDownloads: allowUnverifiedPluginDownloads === true,
    updateChannel: normalizeUpdateChannel(updateChannel),
  };
}

/**
 * Save application settings to the config store.
 * Only saves non-undefined values to avoid overwriting existing settings.
 * @param settings - Partial AppSettings to save
 */
export async function saveAppSettings(settings: Partial<AppSettings>): Promise<void> {
  const { allowUnverifiedPluginDownloads, ...rendererSettings } = settings;
  if (allowUnverifiedPluginDownloads !== undefined) {
    await tauriInvoke('set_allow_unverified_plugin_downloads', {
      enabled: allowUnverifiedPluginDownloads,
    });
  }
  if (Object.values(rendererSettings).every((value) => value === undefined)) {
    return;
  }

  const store = await load(STORE_NAME);
  for (const [key, value] of Object.entries(rendererSettings)) {
    if (value !== undefined) {
      await store.set(key, value);
    }
  }
  await store.save();
}

/** What the user chose about update prompts: a version to skip for good, and a version to remind about later. */
export interface UpdatePromptPreferences {
  skippedVersion?: string;
  remindLater?: { version: string; until: number };
}

export async function getUpdatePromptPreferences(): Promise<UpdatePromptPreferences> {
  const store = await load(STORE_NAME);
  return (await store.get<UpdatePromptPreferences>('updatePromptPreferences')) ?? {};
}

export async function saveUpdatePromptPreferences(
  preferences: UpdatePromptPreferences,
): Promise<void> {
  const store = await load(STORE_NAME);
  await store.set('updatePromptPreferences', preferences);
  await store.save();
}

export async function getServerRoot(): Promise<string> {
  const dataDir = await appDataDir();
  return `${dataDir}/servers`;
}
