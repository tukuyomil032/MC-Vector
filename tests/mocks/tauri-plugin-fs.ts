import {
  ensureRuntimeDirectory,
  getE2eState,
  listRuntimeChildren,
  moveRuntimePath,
  readRuntimeFile,
  recordE2eCall,
  removeRuntimePath,
  setRuntimeFile,
} from '../e2e/support/e2e-runtime';

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

export async function readDir(path: string, _options?: unknown): Promise<DirEntry[]> {
  recordE2eCall('fs', 'readDir', { path });
  return listRuntimeChildren(path).map((entry) => ({
    name: entry.name,
    isFile: !entry.isDirectory,
    isDirectory: entry.isDirectory,
    isSymlink: false,
  }));
}

export async function mkdir(path: string, _options?: unknown): Promise<void> {
  recordE2eCall('fs', 'mkdir', { path });
  ensureRuntimeDirectory(path);
}

export async function remove(path: string, _options?: unknown): Promise<void> {
  recordE2eCall('fs', 'remove', { path });
  removeRuntimePath(path);
}

export async function copyFile(
  source: string,
  destination: string,
  _options?: unknown,
): Promise<void> {
  recordE2eCall('fs', 'copyFile', { source, destination });
  setRuntimeFile(destination, readRuntimeFile(source));
}

export async function rename(oldPath: string, newPath: string, _options?: unknown): Promise<void> {
  recordE2eCall('fs', 'rename', { oldPath, newPath });
  moveRuntimePath(oldPath, newPath);
}

export async function writeTextFile(
  path: string,
  contents: string,
  _options?: unknown,
): Promise<void> {
  recordE2eCall('fs', 'writeTextFile', { path, contents });
  setRuntimeFile(path, contents);
}

export async function readTextFile(path: string, _options?: unknown): Promise<string> {
  recordE2eCall('fs', 'readTextFile', { path });
  return readRuntimeFile(path);
}

export async function exists(path: string, _options?: unknown): Promise<boolean> {
  recordE2eCall('fs', 'exists', { path });
  return Boolean(getE2eState().files[path]);
}

export async function stat(path: string, _options?: unknown) {
  recordE2eCall('fs', 'stat', { path });
  const node = getE2eState().files[path];
  return {
    size: node?.kind === 'file' ? new TextEncoder().encode(node.content ?? '').length : 0,
    mtime: new Date(node?.modified ?? Date.now()),
    isFile: node?.kind === 'file',
    isDirectory: node?.kind === 'directory',
  };
}
