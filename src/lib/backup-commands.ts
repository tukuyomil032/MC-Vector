import type { FileEntryWithMeta, ManagedPathRequest } from './file-commands';
import { type UnlistenFn, tauriInvoke, tauriListen } from './tauri-api';

interface BackupInfo {
  name: string;
  date: Date;
  size: number;
}

function backupDirectoryRequest(serverId: string): ManagedPathRequest {
  return { root: 'backups', serverId, relativePath: '' };
}

function backupFileRequest(serverId: string, backupName: string): ManagedPathRequest {
  const normalized = backupName.trim();
  if (
    !normalized ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized === '.' ||
    normalized === '..' ||
    !normalized.endsWith('.zip')
  ) {
    throw new Error('Invalid backup name');
  }
  return { root: 'backups', serverId, relativePath: normalized };
}

export async function createBackup(
  serverId: string,
  backupName: string,
  sources?: string[],
  compressionLevel?: number,
): Promise<void> {
  return tauriInvoke('create_managed_backup', {
    serverId,
    backupName,
    sources: sources && sources.length > 0 ? sources : null,
    compressionLevel: compressionLevel ?? 5,
  });
}

export async function listBackups(serverId: string): Promise<string[]> {
  try {
    const entries = await tauriInvoke<FileEntryWithMeta[]>('list_dir_with_metadata', {
      request: backupDirectoryRequest(serverId),
    });
    return entries.filter((entry) => entry.name.endsWith('.zip')).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function listBackupsWithMetadata(serverId: string): Promise<BackupInfo[]> {
  try {
    const entries = await tauriInvoke<FileEntryWithMeta[]>('list_dir_with_metadata', {
      request: backupDirectoryRequest(serverId),
    });
    return entries
      .filter((e) => e.name.endsWith('.zip'))
      .map((e) => ({
        name: e.name,
        date: new Date(e.modified * 1000),
        size: e.size,
      }));
  } catch {
    return [];
  }
}

export async function restoreBackup(serverId: string, backupName: string): Promise<void> {
  backupFileRequest(serverId, backupName);
  return tauriInvoke('restore_managed_backup', { serverId, backupName });
}

export async function deleteBackup(serverId: string, backupName: string): Promise<void> {
  await tauriInvoke('delete_managed_path', {
    request: backupFileRequest(serverId, backupName),
  });
}

export function onBackupProgress(
  callback: (data: { serverId: string; progress: number }) => void,
): Promise<UnlistenFn> {
  return tauriListen('backup-progress', callback);
}
