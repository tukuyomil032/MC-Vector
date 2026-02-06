import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn, type Event } from '@tauri-apps/api/event';

export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args ?? {});
  } catch (e) {
    console.error(`[Tauri] invoke ${cmd} failed`, e);
    throw e;
  }
}

export async function tauriListen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> {
  const unlisten = await listen<T>(event, (e: Event<T>) => handler(e.payload));
  return unlisten;
}

export type { UnlistenFn };
