import { type UnlistenFn, tauriInvoke, tauriListen } from './tauri-api';

export interface NgrokTokenStatus {
  configured: boolean;
}

export async function startNgrok(protocol: string, port: number, serverId: string): Promise<void> {
  return tauriInvoke('start_ngrok', { protocol, port, serverId });
}

export async function stopNgrok(): Promise<void> {
  return tauriInvoke('stop_ngrok', {});
}

export async function downloadNgrok(): Promise<string> {
  return tauriInvoke<string>('download_ngrok');
}

export async function isNgrokInstalled(): Promise<boolean> {
  return tauriInvoke<boolean>('is_ngrok_installed');
}

export async function getNgrokTokenStatus(): Promise<NgrokTokenStatus> {
  return tauriInvoke<NgrokTokenStatus>('get_ngrok_token_status', {});
}

export async function setNgrokToken(token: string): Promise<void> {
  await tauriInvoke('set_ngrok_token', { token });
}

export async function clearNgrokToken(): Promise<void> {
  await tauriInvoke('clear_ngrok_token', {});
}

export async function hasNgrokToken(): Promise<boolean> {
  const status = await getNgrokTokenStatus();
  return status.configured;
}

export function onNgrokLog(
  callback: (data: { line: string; serverId: string }) => void,
): Promise<UnlistenFn> {
  return tauriListen('ngrok-log', callback);
}

export function onNgrokStatusChange(
  callback: (data: { status: string; url?: string; serverId?: string }) => void,
): Promise<UnlistenFn> {
  return tauriListen('ngrok-status-change', callback);
}
