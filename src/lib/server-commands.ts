import type { MinecraftServer } from '../renderer/shared/server declaration';
import type { MetricHistorySnapshot } from '../renderer/shared/server-metrics';
import { deleteManagedServer } from './server-lifecycle-commands';
import { type UnlistenFn, tauriInvoke, tauriListen } from './tauri-api';

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
  return tauriInvoke<MinecraftServer[]>('get_servers');
}

export async function updateServer(updated: MinecraftServer): Promise<void> {
  await tauriInvoke('update_server', { server: updated });
}

export function deleteServer(id: string): Promise<boolean> {
  return deleteManagedServer(id);
}

export async function getServerTemplates(): Promise<ServerTemplate[]> {
  return tauriInvoke<ServerTemplate[]>('get_server_templates');
}

export async function saveServerTemplate(template: ServerTemplate): Promise<ServerTemplate> {
  await tauriInvoke('save_server_template', { template });
  return template;
}

export async function deleteServerTemplate(templateId: string): Promise<void> {
  await tauriInvoke('delete_server_template', { templateId });
}

// --- サーバー操作 (Rust コマンド経由) ---

export async function startServer(serverId: string, ..._legacyArguments: unknown[]): Promise<void> {
  return tauriInvoke('start_server', { serverId });
}

export async function stopServer(serverId: string): Promise<void> {
  return tauriInvoke('stop_server', { serverId });
}

export async function restartServer(serverId: string): Promise<void> {
  return tauriInvoke('restart_server', { serverId });
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

export interface PreparedServerJarInstall {
  planId: string;
  latestVersion: string;
  verified: boolean;
}

export interface ServerJarInstallResult {
  serverId: string;
  version: string;
}

export async function prepareServerJarInstall(
  serverId: string,
  software: string,
  version: string,
): Promise<PreparedServerJarInstall | null> {
  return tauriInvoke<PreparedServerJarInstall | null>('prepare_server_jar_install', {
    request: { serverId, software, version },
  });
}

export async function executeServerJarInstall(planId: string): Promise<ServerJarInstallResult> {
  return tauriInvoke<ServerJarInstallResult>('execute_server_jar_install', { planId });
}

export async function getServerStats(serverId: string): Promise<{ cpu: number; memory: number }> {
  return tauriInvoke('get_server_stats', { serverId });
}

export async function getServerMetricHistory(
  serverId: string,
): Promise<MetricHistorySnapshot | null> {
  return tauriInvoke('get_server_metric_history', { serverId });
}

// --- イベントリスナー ---

export function onServerLog(
  callback: (data: { serverId: string; line: string; stream: string }) => void,
): Promise<UnlistenFn> {
  return tauriListen('server-log', callback);
}

export function onServerMetricsUpdated(
  callback: (snapshot: MetricHistorySnapshot) => void,
): Promise<UnlistenFn> {
  return tauriListen('server-metrics-updated', callback);
}

export function onServerStatusChange(callback: {
  (data: { serverId: string; generation?: number; status: string; expected?: boolean }): void;
}): Promise<UnlistenFn> {
  return tauriListen('server-status-change', callback);
}

export function onDownloadProgress(
  callback: (data: { serverId: string; progress: number; status: string }) => void,
): Promise<UnlistenFn> {
  return tauriListen('download-progress', callback);
}
