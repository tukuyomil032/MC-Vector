import { appDataDir } from '@tauri-apps/api/path';
import { load } from '@tauri-apps/plugin-store';
import type { MinecraftServer } from '../renderer/shared/server declaration';
import { type UnlistenFn, tauriInvoke, tauriListen } from './tauri-api';

const STORE_NAME = 'servers.json';
const SERVER_TEMPLATES_KEY = 'serverTemplates';

export interface ServerTemplate {
  id: string;
  name: string;
  profileName?: string;
  groupName?: string;
  version: string;
  software: string;
  port: number;
  memory: number;
  javaPath?: string;
  autoRestartOnCrash?: boolean;
  maxAutoRestarts?: number;
  autoRestartDelaySec?: number;
  autoBackupEnabled?: boolean;
  autoBackupIntervalMin?: number;
  autoBackupScheduleType?: 'interval' | 'daily' | 'weekly';
  autoBackupTime?: string;
  autoBackupWeekday?: number;
}

// --- サーバー CRUD ---

export async function getServers(): Promise<MinecraftServer[]> {
  const store = await load(STORE_NAME);
  const servers = (await store.get<MinecraftServer[]>('servers')) ?? [];
  if (servers.length === 0) {
    return servers;
  }

  const dataDir = (await appDataDir()).replace(/\\/g, '/').replace(/\/$/, '');
  const legacyPrefix = `${dataDir}/servers/`;
  let changed = false;
  for (const server of servers) {
    const normalizedPath = server.path.replace(/\\/g, '/').replace(/\/$/, '');
    if (!normalizedPath.startsWith(legacyPrefix)) {
      continue;
    }
    const legacyDirectoryName = normalizedPath.slice(legacyPrefix.length);
    if (
      !legacyDirectoryName ||
      legacyDirectoryName.includes('/') ||
      legacyDirectoryName === server.id
    ) {
      continue;
    }
    try {
      server.path = await tauriInvoke<string>('migrate_managed_server_directory', {
        legacyDirectoryName,
        serverId: server.id,
      });
      server.unavailableReason = undefined;
      changed = true;
    } catch (error) {
      server.unavailableReason = `Server directory migration failed: ${String(error)}`;
    }
  }
  if (changed) {
    await store.set('servers', servers);
    await store.save();
  }
  return servers;
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
  const target = servers.find((s) => s.id === id);
  if (!target) {
    return false;
  }

  if (await isServerRunning(id)) {
    throw new Error('Cannot delete a running server');
  }

  await tauriInvoke('delete_managed_server_dir', { serverId: id });

  const filtered = servers.filter((s) => s.id !== id);
  await store.set('servers', filtered);
  await store.save();
  return true;
}

export async function getServerTemplates(): Promise<ServerTemplate[]> {
  const store = await load(STORE_NAME);
  return (await store.get<ServerTemplate[]>(SERVER_TEMPLATES_KEY)) ?? [];
}

export async function saveServerTemplate(template: ServerTemplate): Promise<ServerTemplate> {
  const store = await load(STORE_NAME);
  const templates = (await store.get<ServerTemplate[]>(SERVER_TEMPLATES_KEY)) ?? [];
  const index = templates.findIndex((entry) => entry.id === template.id);
  if (index >= 0) {
    templates[index] = template;
  } else {
    templates.push(template);
  }
  await store.set(SERVER_TEMPLATES_KEY, templates);
  await store.save();
  return template;
}

export async function deleteServerTemplate(templateId: string): Promise<void> {
  const store = await load(STORE_NAME);
  const templates = (await store.get<ServerTemplate[]>(SERVER_TEMPLATES_KEY)) ?? [];
  const filtered = templates.filter((template) => template.id !== templateId);
  await store.set(SERVER_TEMPLATES_KEY, filtered);
  await store.save();
}

// --- サーバー操作 (Rust コマンド経由) ---

export async function startServer(
  serverId: string,
  javaPath: string,
  memory: number,
  jarFile: string,
  jvmExtraArgs?: string,
): Promise<void> {
  return tauriInvoke('start_server', {
    serverId,
    javaPath,
    memory,
    jarFile,
    jvmExtraArgs: jvmExtraArgs ?? null,
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
  serverId: string,
  relativePath: string,
  sha256?: string,
): Promise<void> {
  const request: {
    url: string;
    serverId: string;
    relativePath: string;
    checksum?: { algorithm: 'sha256'; value: string };
  } = {
    url,
    serverId,
    relativePath,
  };
  if (sha256) request.checksum = { algorithm: 'sha256', value: sha256 };
  return tauriInvoke('download_server_jar', { request });
}

export async function getServerStats(serverId: string): Promise<{ cpu: number; memory: number }> {
  return tauriInvoke('get_server_stats', { serverId });
}

// --- イベントリスナー ---

export function onServerLog(
  callback: (data: { serverId: string; line: string; stream: string }) => void,
): Promise<UnlistenFn> {
  return tauriListen('server-log', callback);
}

export function onServerStatusChange(
  callback: (data: { serverId: string; status: string }) => void,
): Promise<UnlistenFn> {
  return tauriListen('server-status-change', callback);
}

export function onDownloadProgress(
  callback: (data: { serverId: string; progress: number; status: string }) => void,
): Promise<UnlistenFn> {
  return tauriListen('download-progress', callback);
}
