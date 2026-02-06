import { load } from '@tauri-apps/plugin-store';
import { appDataDir } from '@tauri-apps/api/path';

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
  callback: (value: unknown) => void
): Promise<() => void> {
  const store = await load(STORE_NAME);
  return store.onKeyChange(key, callback);
}

export async function getAppSettings(): Promise<{
  theme?: string;
  [key: string]: unknown;
}> {
  const store = await load(STORE_NAME);
  const theme = await store.get<string>('theme');
  return { theme: theme ?? undefined };
}

export async function saveAppSettings(settings: Record<string, unknown>): Promise<void> {
  const store = await load(STORE_NAME);
  for (const [key, value] of Object.entries(settings)) {
    await store.set(key, value);
  }
  await store.save();
}

export async function getServerRoot(): Promise<string> {
  const dataDir = await appDataDir();
  return `${dataDir}/servers`;
}
