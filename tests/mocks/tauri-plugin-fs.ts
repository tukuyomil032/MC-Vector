export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

export async function readDir(_path: string, _options?: unknown): Promise<DirEntry[]> {
  return [];
}

export async function mkdir(_path: string, _options?: unknown): Promise<void> {}

export async function remove(_path: string, _options?: unknown): Promise<void> {}

export async function copyFile(
  _source: string,
  _destination: string,
  _options?: unknown,
): Promise<void> {}

export async function rename(
  _oldPath: string,
  _newPath: string,
  _options?: unknown,
): Promise<void> {}

export async function writeTextFile(
  _path: string,
  _contents: string,
  _options?: unknown,
): Promise<void> {}

export async function readTextFile(_path: string, _options?: unknown): Promise<string> {
  return '';
}

export async function exists(_path: string, _options?: unknown): Promise<boolean> {
  return false;
}

export async function stat(_path: string, _options?: unknown) {
  return { size: 0, mtime: new Date(), isFile: true, isDirectory: false };
}
