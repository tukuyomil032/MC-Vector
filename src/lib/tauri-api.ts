import { invoke } from '@tauri-apps/api/core';
import { type Event, type UnlistenFn, listen } from '@tauri-apps/api/event';
import { ALLOWED_TAURI_COMMANDS } from './tauri-command-allowlist';

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
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`[Tauri] ${safeCmd} failed: ${detail}`);
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
