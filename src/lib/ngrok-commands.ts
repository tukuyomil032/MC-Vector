import { tauriInvoke, tauriListen, type UnlistenFn } from './tauri-api';
import { load } from '@tauri-apps/plugin-store';

const STORE_NAME = 'config.json';

export async function startNgrok(
  ngrokPath: string,
  protocol: string,
  port: number,
  authtoken: string,
  serverId: string
): Promise<void> {
  return tauriInvoke('start_ngrok', { ngrokPath, protocol, port, authtoken, serverId });
}

export async function stopNgrok(): Promise<void> {
  return tauriInvoke('stop_ngrok', {});
}

export async function downloadNgrok(destDir: string): Promise<string> {
  return tauriInvoke<string>('download_ngrok', { destDir });
}

export async function isNgrokInstalled(path: string): Promise<boolean> {
  return tauriInvoke<boolean>('is_ngrok_installed', { path });
}

export async function getNgrokToken(): Promise<string | null> {
  const store = await load(STORE_NAME);
  return (await store.get<string>('ngrokToken')) ?? null;
}

export async function setNgrokToken(token: string): Promise<void> {
  const store = await load(STORE_NAME);
  await store.set('ngrokToken', token);
  await store.save();
}

export async function clearNgrokToken(): Promise<void> {
  const store = await load(STORE_NAME);
  await store.delete('ngrokToken');
  await store.save();
}

export async function hasNgrokToken(): Promise<boolean> {
  const token = await getNgrokToken();
  return !!token;
}

export function onNgrokLog(
  callback: (data: { line: string; serverId: string }) => void
): Promise<UnlistenFn> {
  return tauriListen('ngrok-log', callback);
}

export function onNgrokStatusChange(
  callback: (data: { status: string; url?: string; serverId?: string }) => void
): Promise<UnlistenFn> {
  return tauriListen('ngrok-status-change', callback);
}
