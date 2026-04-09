import { appDataDir } from '@tauri-apps/api/path';
import { load } from '@tauri-apps/plugin-store';

const STORE_NAME = 'config.json';

export async function getConfig<T>(key: string): Promise<T | null> {
  const store = await load(STORE_NAME);
  return (await store.get<T>(key)) ?? null;
}

export async function setConfig<T>(key: string, value: T): Promise<void> {
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
  return {
    theme: theme ?? undefined,
    locale: locale ?? undefined,
  };
}

/**
 * Save application settings to the config store.
 * Only saves non-undefined values to avoid overwriting existing settings.
 * @param settings - Partial AppSettings to save
 */
export async function saveAppSettings(settings: Partial<AppSettings>): Promise<void> {
  const store = await load(STORE_NAME);
  for (const [key, value] of Object.entries(settings)) {
    if (value !== undefined) {
      await store.set(key, value);
    }
  }
  await store.save();
}

export async function getServerRoot(): Promise<string> {
  const dataDir = await appDataDir();
  return `${dataDir}/servers`;
}
