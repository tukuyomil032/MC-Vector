import { tauriInvoke, tauriListen, type UnlistenFn } from './tauri-api';

/** Provider identifiers only. All compatibility, URLs, hashes and paths belong to Rust. */
export type PluginProjectRef =
  | { provider: 'modrinth'; projectId: string }
  | { provider: 'hangar'; owner: string; slug: string }
  | { provider: 'spiget'; resourceId: number };

export interface PluginInstallArtifactPreview {
  id: string;
  project: PluginProjectRef;
  title: string;
  version: string;
  fileName: string;
  installedFileName: string | null;
  dependency: boolean;
  verified: boolean;
  compatibility: 'compatible' | 'incompatible' | 'unknown';
  supportedVersions: string[];
}

export interface PluginInstallPreview {
  token: string | null;
  expiresInSeconds: number;
  serverId: string;
  serverVersion: string;
  serverSoftware: string;
  targetDirectory: 'plugins' | 'mods';
  artifacts: PluginInstallArtifactPreview[];
  missingDependencyIds: string[];
  externalUrl: string | null;
  requiresUnverifiedDownloads: boolean;
}

export interface PluginInstallResult {
  serverId: string;
  installedFileNames: string[];
}

export interface PluginInstallProgress {
  downloaded: number;
  total: number;
  artifactId: string;
}

export function preparePluginInstall(
  serverId: string,
  project: PluginProjectRef,
  replaceFileName?: string,
): Promise<PluginInstallPreview> {
  return tauriInvoke('prepare_plugin_install', {
    request: { serverId, project, replaceFileName: replaceFileName ?? null },
  });
}

/** Listen on download-progress-<token> for aggregate-compatible artifact progress. */
export function executePluginInstall(
  token: string,
  confirmedDependencyIds: readonly string[],
): Promise<PluginInstallResult> {
  return tauriInvoke('execute_plugin_install', { request: { token, confirmedDependencyIds } });
}

export function onPluginInstallProgress(
  token: string,
  callback: (progress: PluginInstallProgress) => void,
): Promise<UnlistenFn> {
  return tauriListen(`download-progress-${token}`, callback);
}

export function toggleInstalledPlugin(serverId: string, fileName: string): Promise<string> {
  return tauriInvoke('toggle_installed_plugin', { request: { serverId, fileName } });
}

export function uninstallInstalledPlugin(serverId: string, fileName: string): Promise<void> {
  return tauriInvoke('uninstall_installed_plugin', { request: { serverId, fileName } });
}
