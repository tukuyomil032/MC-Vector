import { invoke } from '@tauri-apps/api/core';
import { type Event, listen, type UnlistenFn } from '@tauri-apps/api/event';

const ALLOWED_TAURI_COMMANDS = new Set([
  'start_server',
  'stop_server',
  'send_command',
  'is_server_running',
  'get_server_pid',
  'get_server_stats',
  'download_server_jar',
  'download_java',
  'start_ngrok',
  'stop_ngrok',
  'download_ngrok',
  'is_ngrok_installed',
  'create_backup',
  'restore_backup',
  'compress_item',
  'extract_item',
  'download_file',
  'list_dir_with_metadata',
  'can_update_app',
  'get_app_location',
]);

function assertAllowedCommand(cmd: string): string {
  const normalized = cmd.trim();
  if (!ALLOWED_TAURI_COMMANDS.has(normalized)) {
    throw new Error(`Blocked tauri command: ${normalized}`);
  }
  return normalized;
}

export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const safeCmd = assertAllowedCommand(cmd);
  try {
    return await invoke<T>(safeCmd, args ?? {});
  } catch (e) {
    console.error(`[Tauri] invoke ${safeCmd} failed`, e);
    throw new Error(`[Tauri] ${safeCmd} failed`);
  }
}

export async function tauriListen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  const unlisten = await listen<T>(event, (e: Event<T>) => handler(e.payload));
  return unlisten;
}

export type { UnlistenFn };
