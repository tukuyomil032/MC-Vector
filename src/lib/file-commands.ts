import { open } from '@tauri-apps/plugin-dialog';
import { appDataDir } from '@tauri-apps/api/path';
import {
  copyFile,
  type DirEntry,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { tauriInvoke } from './tauri-api';

export interface FileEntryWithMeta {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: number; // unix timestamp in seconds
}

const ALLOWED_APPDATA_SUBDIRS = ['servers', 'java', 'ngrok'];

function normalizePath(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/') && !/^[A-Za-z]:\/$/.test(normalized)) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function isWithinRoot(targetPath: string, rootPath: string): boolean {
  return targetPath === rootPath || targetPath.startsWith(`${rootPath}/`);
}

async function getAllowedRoots(): Promise<string[]> {
  const dataDir = normalizePath(await appDataDir());
  return [
    dataDir,
    ...ALLOWED_APPDATA_SUBDIRS.map((segment) => normalizePath(`${dataDir}/${segment}`)),
  ];
}

async function assertAllowedPath(path: string): Promise<string> {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath || normalizedPath.includes('\0')) {
    throw new Error('Invalid path');
  }
  if (normalizedPath.includes('/../') || normalizedPath.endsWith('/..')) {
    throw new Error('Path traversal is not allowed');
  }

  const allowedRoots = await getAllowedRoots();
  if (!allowedRoots.some((root) => isWithinRoot(normalizedPath, root))) {
    throw new Error('Path is outside allowed scope');
  }

  return path;
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

export async function listFiles(dirPath: string): Promise<DirEntry[]> {
  const safeDirPath = await assertAllowedPath(dirPath);
  return readDir(safeDirPath);
}

export async function listFilesWithMetadata(dirPath: string): Promise<FileEntryWithMeta[]> {
  const safeDirPath = await assertAllowedPath(dirPath);
  return tauriInvoke<FileEntryWithMeta[]>('list_dir_with_metadata', {
    path: safeDirPath,
  });
}

export async function readFileContent(filePath: string): Promise<string> {
  const safeFilePath = await assertAllowedPath(filePath);
  return readTextFile(safeFilePath);
}

export async function saveFileContent(filePath: string, content: string): Promise<void> {
  const safeFilePath = await assertAllowedPath(filePath);
  return writeTextFile(safeFilePath, content);
}

export async function importFile(destDir: string): Promise<string | null> {
  const safeDestDir = await assertAllowedPath(destDir);
  const selected = await open({ multiple: false });
  if (!selected) return null;
  const filePath = selected as string;
  const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'file';
  const destPath = `${safeDestDir}/${fileName}`;
  await copyFile(filePath, destPath);
  return destPath;
}

export async function importFilesFromPaths(paths: string[], destDir: string): Promise<string[]> {
  const safeDestDir = await assertAllowedPath(destDir);
  const results: string[] = [];
  for (const filePath of paths) {
    const normalizedSource = String(filePath);
    const fileName =
      normalizedSource.split('/').pop() ?? normalizedSource.split('\\').pop() ?? 'file';
    const destPath = `${safeDestDir}/${fileName}`;
    await copyFile(normalizedSource, destPath);
    results.push(destPath);
  }
  return results;
}

export async function importFilesDialog(destDir: string): Promise<string[]> {
  const selected = await open({ multiple: true });
  if (!selected) return [];
  const files = Array.isArray(selected) ? selected : [selected];
  return importFilesFromPaths(
    files.map((filePath) => filePath as string),
    destDir,
  );
}

export async function createFile(dirPath: string, name: string): Promise<void> {
  const safeDirPath = await assertAllowedPath(dirPath);
  const safeName = assertSafeName(name);
  await writeTextFile(`${safeDirPath}/${safeName}`, '');
}

export async function createFolder(dirPath: string, name: string): Promise<void> {
  const safeDirPath = await assertAllowedPath(dirPath);
  const safeName = assertSafeName(name);
  await mkdir(`${safeDirPath}/${safeName}`, { recursive: true });
}

export async function deleteItem(path: string): Promise<void> {
  const safePath = await assertAllowedPath(path);
  await remove(safePath, { recursive: true });
}

export async function moveItem(from: string, to: string): Promise<void> {
  const safeFrom = await assertAllowedPath(from);
  const safeTo = await assertAllowedPath(to);
  await rename(safeFrom, safeTo);
}

export async function compressItem(sources: string | string[], dest?: string): Promise<string> {
  const sourceList = Array.isArray(sources) ? sources : [sources];
  const safeSources = await Promise.all(sourceList.map((source) => assertAllowedPath(source)));
  const destination = await assertAllowedPath(dest || `${safeSources[0]}.zip`);
  return tauriInvoke<string>('compress_item', {
    sources: safeSources,
    dest: destination,
  });
}

export async function extractItem(archivePath: string, destPath: string): Promise<void> {
  const safeArchivePath = await assertAllowedPath(archivePath);
  const safeDestPath = await assertAllowedPath(destPath);
  return tauriInvoke('extract_item', { archive: safeArchivePath, dest: safeDestPath });
}

export async function openInFinder(path: string): Promise<void> {
  const safePath = await assertAllowedPath(path);
  await revealItemInDir(safePath);
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const safeFilePath = await assertAllowedPath(filePath);
    const content = await readTextFile(safeFilePath);
    const parsed = JSON.parse(content);
    return isJsonContainer(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  const safeFilePath = await assertAllowedPath(filePath);
  await writeTextFile(safeFilePath, JSON.stringify(data, null, 2));
}
