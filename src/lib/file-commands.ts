import {
  readDir,
  readTextFile,
  writeTextFile,
  mkdir,
  remove,
  rename,
  copyFile,
  type DirEntry,
} from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { tauriInvoke } from './tauri-api';

export interface FileEntryWithMeta {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: number; // unix timestamp in seconds
}

export async function listFiles(dirPath: string): Promise<DirEntry[]> {
  return readDir(dirPath);
}

export async function listFilesWithMetadata(dirPath: string): Promise<FileEntryWithMeta[]> {
  return tauriInvoke<FileEntryWithMeta[]>('list_dir_with_metadata', { path: dirPath });
}

export async function readFileContent(filePath: string): Promise<string> {
  return readTextFile(filePath);
}

export async function saveFileContent(filePath: string, content: string): Promise<void> {
  return writeTextFile(filePath, content);
}

export async function importFile(destDir: string): Promise<string | null> {
  const selected = await open({ multiple: false });
  if (!selected) return null;
  const filePath = selected as string;
  const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'file';
  const destPath = `${destDir}/${fileName}`;
  await copyFile(filePath, destPath);
  return destPath;
}

export async function importFilesDialog(destDir: string): Promise<string[]> {
  const selected = await open({ multiple: true });
  if (!selected) return [];
  const files = Array.isArray(selected) ? selected : [selected];
  const results: string[] = [];
  for (const filePath of files) {
    const fp = filePath as string;
    const fileName = fp.split('/').pop() ?? fp.split('\\').pop() ?? 'file';
    const destPath = `${destDir}/${fileName}`;
    await copyFile(fp, destPath);
    results.push(destPath);
  }
  return results;
}

export async function createFile(dirPath: string, name: string): Promise<void> {
  await writeTextFile(`${dirPath}/${name}`, '');
}

export async function createFolder(dirPath: string, name: string): Promise<void> {
  await mkdir(`${dirPath}/${name}`, { recursive: true });
}

export async function deleteItem(path: string): Promise<void> {
  await remove(path, { recursive: true });
}

export async function moveItem(from: string, to: string): Promise<void> {
  await rename(from, to);
}

export async function compressItem(sources: string | string[], dest?: string): Promise<string> {
  const sourceList = Array.isArray(sources) ? sources : [sources];
  const destination = dest || `${sourceList[0]}.zip`;
  return tauriInvoke<string>('compress_item', { sources: sourceList, dest: destination });
}

export async function extractItem(archivePath: string, destPath: string): Promise<void> {
  return tauriInvoke('extract_item', { archive: archivePath, dest: destPath });
}

export async function openInFinder(path: string): Promise<void> {
  await revealItemInDir(path);
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const content = await readTextFile(filePath);
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeTextFile(filePath, JSON.stringify(data, null, 2));
}
