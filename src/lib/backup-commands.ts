import { tauriInvoke, tauriListen, type UnlistenFn } from './tauri-api';
import { readDir, remove, type DirEntry } from '@tauri-apps/plugin-fs';
import { type FileEntryWithMeta } from './file-commands';

interface BackupInfo {
  name: string;
  date: Date;
  size: number;
}

export async function createBackup(
  serverPath: string,
  backupName: string,
  sources?: string[],
  compressionLevel?: number
): Promise<void> {
  const backupDir = `${serverPath}/backups`;
  return tauriInvoke('create_backup', {
    serverId: backupName,
    sourceDir: serverPath,
    backupDir,
    sources: sources && sources.length > 0 ? sources : null,
    compressionLevel: compressionLevel ?? 5,
  });
}

export async function listBackups(serverPath: string): Promise<string[]> {
  const backupDir = `${serverPath}/backups`;
  try {
    const entries = await readDir(backupDir);
    return entries.filter((e: DirEntry) => e.name.endsWith('.zip')).map((e: DirEntry) => e.name);
  } catch {
    return [];
  }
}

export async function listBackupsWithMetadata(serverPath: string): Promise<BackupInfo[]> {
  const backupDir = `${serverPath}/backups`;
  try {
    const { listFilesWithMetadata } = await import('./file-commands');
    const entries: FileEntryWithMeta[] = await listFilesWithMetadata(backupDir);
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

export async function restoreBackup(serverPath: string, backupName: string): Promise<void> {
  const backupPath = `${serverPath}/backups/${backupName}`;
  return tauriInvoke('restore_backup', { backupPath, targetDir: serverPath });
}

export async function deleteBackup(serverPath: string, backupName: string): Promise<void> {
  const backupPath = `${serverPath}/backups/${backupName}`;
  await remove(backupPath);
}

export function onBackupProgress(
  callback: (data: { serverId: string; progress: number }) => void
): Promise<UnlistenFn> {
  return tauriListen('backup-progress', callback);
}
