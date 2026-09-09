import type { FileEntryWithMeta, ManagedPathRequest } from './file-commands';
import { type UnlistenFn, tauriInvoke, tauriListen } from './tauri-api';

export interface BackupInfo {
  name: string;
  date: Date;
  size: number;
  backupId?: string;
  origin?: 'manual' | 'automatic';
  consistency?: 'quiesced' | 'live';
  restoreEligible?: boolean;
}

interface ManagedBackupRecord {
  backupId: string;
  archivePath: string;
  origin: 'manual' | 'automatic';
  consistency: 'quiesced' | 'live';
  createdAt: string;
  totalBytes: number;
  restoreEligible: boolean;
}

export interface BackupRetentionResult {
  deletedNames: string[];
  failedDeleteCount: number;
  listingFailed: boolean;
}

function backupDirectoryRequest(serverId: string): ManagedPathRequest {
  return { root: 'backups', serverId, relativePath: '' };
}

function backupCatalogRequest(serverId: string): ManagedPathRequest {
  return {
    root: 'backups',
    serverId,
    relativePath: '.mc-vector-backup-meta.json',
  };
}

function legacyBackupCatalogRequest(serverId: string): ManagedPathRequest {
  return {
    root: 'servers',
    serverId,
    relativePath: 'backups/.mc-vector-backup-meta.json',
  };
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

type ManagedJsonReadResult =
  | { exists: false }
  | {
      exists: true;
      value: unknown;
    };

interface MissingManagedPathErrorOptions {
  allowMissingDirectory?: boolean;
  allowMissingManagedPathParent?: boolean;
}

function isMissingManagedPathError(
  error: unknown,
  options: MissingManagedPathErrorOptions = {},
): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /\(os error (?:2|3)\)\s*$/i.test(message) ||
    /no such file or directory/i.test(message) ||
    /(?:path|file|directory) not found\b/i.test(message) ||
    /cannot find (?:the )?(?:file|path|directory)\b/i.test(message) ||
    (options.allowMissingManagedPathParent === true &&
      /^(?:\[tauri\] (?:read_managed_text_file|list_dir_with_metadata|list_managed_backups) failed: )?managed path parent does not exist$/i.test(
        message,
      )) ||
    (options.allowMissingDirectory === true &&
      /^(?:\[tauri\] (?:list_dir_with_metadata|list_managed_backups) failed: )?directory does not exist$/i.test(
        message,
      ))
  );
}

async function readManagedJson(request: ManagedPathRequest): Promise<ManagedJsonReadResult> {
  let content: string;
  try {
    content = await tauriInvoke<string>('read_managed_text_file', { request });
  } catch (error) {
    if (isMissingManagedPathError(error, { allowMissingManagedPathParent: true })) {
      return { exists: false };
    }
    throw error;
  }

  return { exists: true, value: JSON.parse(content) };
}

export async function readBackupCatalog(serverId: string): Promise<unknown | null> {
  const current = await readManagedJson(backupCatalogRequest(serverId));
  if (current.exists) {
    return current.value;
  }

  const legacy = await readManagedJson(legacyBackupCatalogRequest(serverId));
  return legacy.exists ? legacy.value : null;
}

export async function writeBackupCatalog(serverId: string, catalog: unknown): Promise<void> {
  return tauriInvoke('write_managed_text_file', {
    request: backupCatalogRequest(serverId),
    content: JSON.stringify(catalog, null, 2),
  });
}

export type BackupNameValidationError = 'empty' | 'unsafeCharacters' | null;

export function getBackupNameValidationError(backupName: string): BackupNameValidationError {
  const normalized = backupName.trim();
  if (!normalized) {
    return 'empty';
  }
  if (
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized.includes(':') ||
    /[*?"<>|]/.test(normalized) ||
    normalized.includes('..') ||
    normalized === '.' ||
    normalized.includes('\0') ||
    hasControlCharacters(normalized)
  ) {
    return 'unsafeCharacters';
  }
  return null;
}

export function normalizeBackupSources(paths: readonly string[]): string[] {
  const candidates = new Set<string>();
  for (const path of paths) {
    const trimmed = path.trim();
    if (trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[A-Za-z]:/.test(trimmed)) {
      continue;
    }

    const normalized = trimmed
      .replace(/\\/g, '/')
      .replace(/\/{2,}/g, '/')
      .replace(/^\/+|\/+$/g, '');
    const lowerCaseNormalized = normalized.toLowerCase();
    if (
      !normalized ||
      lowerCaseNormalized === 'backups' ||
      lowerCaseNormalized.startsWith('backups/')
    ) {
      continue;
    }
    const segments = normalized.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      continue;
    }
    candidates.add(normalized);
  }

  return Array.from(candidates)
    .sort((left, right) => {
      const depthDifference = left.split('/').length - right.split('/').length;
      return depthDifference || left.localeCompare(right);
    })
    .filter((path, index, sorted) => {
      return !sorted.slice(0, index).some((ancestor) => path.startsWith(`${ancestor}/`));
    })
    .sort((left, right) => left.localeCompare(right));
}

function backupFileRequest(serverId: string, backupName: string): ManagedPathRequest {
  const normalized = backupName.trim();
  if (
    !normalized ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized.includes(':') ||
    /[*?"<>|]/.test(normalized) ||
    normalized.includes('..') ||
    normalized === '.' ||
    normalized.includes('\0') ||
    hasControlCharacters(normalized) ||
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
  compressionLevel?: number,
): Promise<void> {
  return createBackupWithOrigin(serverId, backupName, compressionLevel, 'manual');
}

async function createBackupWithOrigin(
  serverId: string,
  backupName: string,
  compressionLevel: number | undefined,
  origin: 'manual' | 'automatic',
): Promise<void> {
  if (getBackupNameValidationError(backupName) !== null) {
    throw new Error('Invalid backup name');
  }
  const payload: Record<string, unknown> = {
    serverId,
    backupName,
    sources: null,
    compressionLevel: compressionLevel ?? 5,
  };
  if (origin === 'automatic') {
    payload.origin = origin;
  }
  return tauriInvoke('create_managed_backup', payload);
}

export async function createAutomaticBackup(
  serverId: string,
  backupName: string,
  compressionLevel?: number,
): Promise<void> {
  return createBackupWithOrigin(serverId, backupName, compressionLevel, 'automatic');
}

export async function listBackups(serverId: string): Promise<string[]> {
  try {
    const entries = await tauriInvoke<FileEntryWithMeta[]>('list_dir_with_metadata', {
      request: backupDirectoryRequest(serverId),
    });
    return entries.filter((entry) => entry.name.endsWith('.zip')).map((entry) => entry.name);
  } catch (error) {
    if (
      isMissingManagedPathError(error, {
        allowMissingDirectory: true,
        allowMissingManagedPathParent: true,
      })
    ) {
      return [];
    }
    throw error;
  }
}

export async function listBackupsWithMetadata(serverId: string): Promise<BackupInfo[]> {
  try {
    const records = await tauriInvoke<ManagedBackupRecord[]>('list_managed_backups', { serverId });
    return records.map((record) => {
      const numericTimestamp = Number(record.createdAt);
      const date = Number.isFinite(numericTimestamp)
        ? new Date(numericTimestamp)
        : new Date(record.createdAt);
      return {
        name: record.archivePath,
        date,
        size: record.totalBytes,
        backupId: record.backupId,
        origin: record.origin,
        consistency: record.consistency,
        restoreEligible: record.restoreEligible,
      };
    });
  } catch (error) {
    if (
      isMissingManagedPathError(error, {
        allowMissingDirectory: true,
        allowMissingManagedPathParent: true,
      })
    ) {
      return [];
    }
    throw error;
  }
}

export async function applyBackupRetention(
  serverId: string,
  retainCount: number,
  retainDays: number,
): Promise<BackupRetentionResult> {
  try {
    const result = await tauriInvoke<{
      deletedNames: string[];
      failedDeleteCount: number;
    }>('apply_managed_backup_retention', {
      serverId,
      retainCount: Math.max(0, Math.floor(retainCount)),
      retainDays: Math.max(0, Math.floor(retainDays)),
    });
    return {
      deletedNames: result.deletedNames,
      failedDeleteCount: result.failedDeleteCount,
      listingFailed: false,
    };
  } catch {
    return { deletedNames: [], failedDeleteCount: 0, listingFailed: true };
  }
}

export async function restoreBackup(serverId: string, backupName: string): Promise<void> {
  backupFileRequest(serverId, backupName);
  return tauriInvoke('restore_managed_backup', { serverId, backupName });
}

export async function deleteBackup(serverId: string, backupName: string): Promise<void> {
  backupFileRequest(serverId, backupName);
  await tauriInvoke('delete_managed_backup', { serverId, backupName });
}

export function onBackupProgress(
  callback: (data: { serverId: string; progress: number }) => void,
): Promise<UnlistenFn> {
  return tauriListen('backup-progress', callback);
}
