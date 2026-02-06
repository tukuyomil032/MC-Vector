import { tauriInvoke, tauriListen, type UnlistenFn } from './tauri-api';
import { load } from '@tauri-apps/plugin-store';
import type { MinecraftServer } from '../renderer/shared/server declaration';

const STORE_NAME = 'servers.json';

// --- サーバー CRUD (Store で完結 → Rust 不要) ---

export async function getServers(): Promise<MinecraftServer[]> {
  const store = await load(STORE_NAME);
  return (await store.get<MinecraftServer[]>('servers')) ?? [];
}

export async function addServer(server: MinecraftServer): Promise<MinecraftServer> {
  const store = await load(STORE_NAME);
  const servers = (await store.get<MinecraftServer[]>('servers')) ?? [];
  servers.push(server);
  await store.set('servers', servers);
  await store.save();
  return server;
}

export async function updateServer(updated: MinecraftServer): Promise<void> {
  const store = await load(STORE_NAME);
  const servers = (await store.get<MinecraftServer[]>('servers')) ?? [];
  const idx = servers.findIndex((s) => s.id === updated.id);
  if (idx !== -1) {
    servers[idx] = updated;
    await store.set('servers', servers);
    await store.save();
  }
}

export async function deleteServer(id: string): Promise<boolean> {
  const store = await load(STORE_NAME);
  const servers = (await store.get<MinecraftServer[]>('servers')) ?? [];
  const filtered = servers.filter((s) => s.id !== id);
  await store.set('servers', filtered);
  await store.save();
  return true;
}

// --- サーバー操作 (Rust コマンド経由) ---

export async function startServer(
  serverId: string,
  javaPath: string,
  serverPath: string,
  memory: number,
  jarFile: string
): Promise<void> {
  return tauriInvoke('start_server', {
    serverId,
    javaPath,
    serverPath,
    memory,
    jarFile,
  });
}

export async function stopServer(serverId: string): Promise<void> {
  return tauriInvoke('stop_server', { serverId });
}

export async function sendCommand(serverId: string, command: string): Promise<void> {
  return tauriInvoke('send_command', { serverId, command });
}

export async function isServerRunning(serverId: string): Promise<boolean> {
  return tauriInvoke('is_server_running', { serverId });
}

export async function getServerPid(serverId: string): Promise<number> {
  return tauriInvoke('get_server_pid', { serverId });
}

export async function downloadServerJar(
  url: string,
  destPath: string,
  serverId: string
): Promise<void> {
  return tauriInvoke('download_server_jar', { url, destPath, serverId });
}

export async function getServerStats(pid: number): Promise<{ cpu: number; memory: number }> {
  return tauriInvoke('get_server_stats', { pid });
}

// --- イベントリスナー ---

export function onServerLog(
  callback: (data: { serverId: string; line: string; stream: string }) => void
): Promise<UnlistenFn> {
  return tauriListen('server-log', callback);
}

export function onServerStatusChange(
  callback: (data: { serverId: string; status: string }) => void
): Promise<UnlistenFn> {
  return tauriListen('server-status-change', callback);
}

export function onDownloadProgress(
  callback: (data: { serverId: string; progress: number; status: string }) => void
): Promise<UnlistenFn> {
  return tauriListen('download-progress', callback);
}
