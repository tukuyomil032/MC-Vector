import { appDataDir } from '@tauri-apps/api/path';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { tauriInvoke } from './tauri-api';

export type ManagedRoot = 'servers' | 'java' | 'ngrok' | 'backups';

export interface ManagedPathRequest {
  root: ManagedRoot;
  serverId?: string;
  relativePath: string;
}

export interface FileEntryWithMeta {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: number; // unix timestamp in seconds
}

function normalizePath(input: string): string {
  return input
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
}

function hasInvalidRelativeSegment(path: string): boolean {
  return path.split('/').some((segment) => !segment || segment === '.' || segment === '..');
}

async function toManagedRequest(path: string): Promise<ManagedPathRequest> {
  const normalizedPath = normalizePath(path.trim());
  const dataDir = normalizePath(await appDataDir());
  if (!normalizedPath || normalizedPath.includes('\0')) {
    throw new Error('Invalid path');
  }

  const prefix = `${dataDir}/`;
  if (!normalizedPath.startsWith(prefix)) {
    throw new Error('Path is outside MC-Vector managed storage');
  }

  const segments = normalizedPath.slice(prefix.length).split('/');
  const root = segments.shift();
  if (root !== 'servers' && root !== 'java' && root !== 'ngrok' && root !== 'backups') {
    throw new Error('Path is outside MC-Vector managed storage');
  }

  if (root === 'servers' || root === 'backups') {
    const serverId = segments.shift();
    if (!serverId || hasInvalidRelativeSegment(serverId)) {
      throw new Error('Managed server ID is missing or invalid');
    }
    const relativePath = segments.join('/');
    if (relativePath && hasInvalidRelativeSegment(relativePath)) {
      throw new Error('Path traversal is not allowed');
    }
    return { root, serverId, relativePath };
  }

  const relativePath = segments.join('/');
  if (!relativePath || hasInvalidRelativeSegment(relativePath)) {
    throw new Error('Managed relative path is missing or invalid');
  }
  return { root, relativePath };
}

async function assertAllowedPath(path: string): Promise<ManagedPathRequest> {
  const request = await toManagedRequest(path);
  await tauriInvoke<string>('resolve_managed_path', { request });
  return request;
}

async function resolveAllowedPath(
  path: string,
): Promise<{ request: ManagedPathRequest; absolutePath: string }> {
  const request = await toManagedRequest(path);
  const absolutePath = await tauriInvoke<string>('resolve_managed_path', { request });
  return { request, absolutePath };
}

function assertSafeName(name: string): string {
  const normalized = name.trim();
  if (
    !normalized ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized.includes('..')
  ) {
    throw new Error('Invalid file or folder name');
  }
  return normalized;
}

function isJsonContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || (typeof value === 'object' && value !== null);
}

async function writeManagedTextFile(request: ManagedPathRequest, content: string): Promise<void> {
  return tauriInvoke('write_managed_text_file', {
    request,
    content,
  });
}

export async function listFiles(dirPath: string): Promise<FileEntryWithMeta[]> {
  const request = await assertAllowedPath(dirPath);
  return tauriInvoke<FileEntryWithMeta[]>('list_dir_with_metadata', { request });
}

export async function listFilesWithMetadata(dirPath: string): Promise<FileEntryWithMeta[]> {
  return listFiles(dirPath);
}

export async function readFileContent(filePath: string): Promise<string> {
  const request = await assertAllowedPath(filePath);
  return tauriInvoke<string>('read_managed_text_file', {
    request,
  });
}

export async function saveFileContent(filePath: string, content: string): Promise<void> {
  const request = await assertAllowedPath(filePath);
  return writeManagedTextFile(request, content);
}

export async function importFile(destDir: string): Promise<string | null> {
  const imported = await importFilesDialog(destDir);
  return imported[0] ?? null;
}

export async function importFilesFromPaths(_paths: string[], destDir: string): Promise<string[]> {
  // The native picker owns source selection.  Keeping dropped paths out of IPC
  // prevents the renderer from turning this into an arbitrary file-copy API.
  return importFilesDialog(destDir);
}

export async function importFilesDialog(destDir: string): Promise<string[]> {
  const request = await assertAllowedPath(destDir);
  const imported = await tauriInvoke<
    Array<{ serverId?: string; relativePath: string; isDirectory: boolean; size: number }>
  >('import_managed_files', { request });
  const dataDir = normalizePath(await appDataDir());
  return imported.map((entry) => {
    const serverSegment = entry.serverId ? `/${entry.serverId}` : '';
    return `${dataDir}/${request.root}${serverSegment}/${entry.relativePath}`;
  });
}

export async function createFile(dirPath: string, name: string): Promise<void> {
  const safeDirPath = await assertAllowedPath(dirPath);
  const safeName = assertSafeName(name);
  const request: ManagedPathRequest = {
    ...safeDirPath,
    relativePath: safeDirPath.relativePath ? `${safeDirPath.relativePath}/${safeName}` : safeName,
  };
  await writeManagedTextFile(request, '');
}

export async function createFolder(dirPath: string, name: string): Promise<void> {
  const safeDirPath = await assertAllowedPath(dirPath);
  const safeName = assertSafeName(name);
  const request: ManagedPathRequest = {
    ...safeDirPath,
    relativePath: safeDirPath.relativePath ? `${safeDirPath.relativePath}/${safeName}` : safeName,
  };
  await tauriInvoke('create_managed_directory', { request });
}

export async function createManagedServerDirectory(serverId: string): Promise<string> {
  const dataDir = normalizePath(await appDataDir());
  const request: ManagedPathRequest = {
    root: 'servers',
    serverId,
    relativePath: '',
  };
  await tauriInvoke('create_managed_directory', { request });
  return `${dataDir}/servers/${serverId}`;
}

export async function deleteManagedServerDirectory(serverId: string): Promise<void> {
  await tauriInvoke('delete_managed_server_dir', { serverId });
}

export async function cloneManagedServer(
  sourceServerId: string,
  destinationServerId: string,
): Promise<void> {
  await tauriInvoke('clone_managed_server', { sourceServerId, destinationServerId });
}

export async function deleteItem(path: string): Promise<void> {
  const safePath = await assertAllowedPath(path);
  await tauriInvoke('delete_managed_path', { request: safePath });
}

export async function moveItem(from: string, to: string): Promise<void> {
  const safeFrom = await assertAllowedPath(from);
  const safeTo = await assertAllowedPath(to);
  await tauriInvoke('move_managed_path', { from: safeFrom, to: safeTo });
}

export async function compressItem(sources: string | string[], dest?: string): Promise<string> {
  const sourceList = Array.isArray(sources) ? sources : [sources];
  const safeSources = await Promise.all(sourceList.map((source) => assertAllowedPath(source)));
  const destinationPath = dest || `${sourceList[0]}.zip`;
  const destination = await assertAllowedPath(destinationPath);
  return tauriInvoke<string>('compress_managed_items', {
    sources: safeSources,
    destination,
  });
}

export async function extractItem(archivePath: string, destPath: string): Promise<void> {
  const safeArchivePath = await assertAllowedPath(archivePath);
  const safeDestPath = await assertAllowedPath(destPath);
  return tauriInvoke('extract_managed_item', {
    archive: safeArchivePath,
    destination: safeDestPath,
  });
}

export async function openInFinder(path: string): Promise<void> {
  const { absolutePath } = await resolveAllowedPath(path);
  await revealItemInDir(absolutePath);
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const content = await readFileContent(filePath);
    const parsed = JSON.parse(content);
    return isJsonContainer(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  const safeFilePath = await assertAllowedPath(filePath);
  await writeManagedTextFile(safeFilePath, JSON.stringify(data, null, 2));
}
