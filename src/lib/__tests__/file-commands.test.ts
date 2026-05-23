import { type MockInstance, beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();
const copyFileMock = vi.fn();
const mkdirMock = vi.fn();
const readDirMock = vi.fn();
const removeMock = vi.fn();
const renameMock = vi.fn();
const openMock = vi.fn();

vi.mock('../tauri-api', () => ({ tauriInvoke: tauriInvokeMock, tauriListen: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  copyFile: copyFileMock,
  mkdir: mkdirMock,
  readDir: readDirMock,
  remove: removeMock,
  rename: renameMock,
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }));
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: vi.fn() }));

function mockResolvePath() {
  (tauriInvokeMock as MockInstance).mockImplementation((cmd: string, args?: unknown) => {
    if (cmd === 'resolve_managed_path') {
      return Promise.resolve((args as { path: string }).path);
    }
    return Promise.resolve(undefined);
  });
}

beforeEach(() => {
  vi.resetModules();
  tauriInvokeMock.mockReset();
  copyFileMock.mockReset();
  mkdirMock.mockReset();
  readDirMock.mockReset();
  removeMock.mockReset();
  renameMock.mockReset();
  openMock.mockReset();
});

describe('listFiles', () => {
  it('returns DirEntry array from readDir', async () => {
    mockResolvePath();
    const entries = [{ name: 'server.jar', isDirectory: false, isFile: true, isSymlink: false }];
    readDirMock.mockResolvedValue(entries);

    const { listFiles } = await import('../file-commands');
    const result = await listFiles('/servers/default');
    expect(result).toEqual(entries);
    expect(readDirMock).toHaveBeenCalledWith('/servers/default');
  });

  it('throws on empty path', async () => {
    const { listFiles } = await import('../file-commands');
    await expect(listFiles('')).rejects.toThrow('Invalid path');
    await expect(listFiles('  ')).rejects.toThrow('Invalid path');
  });

  it('throws on null-byte path', async () => {
    const { listFiles } = await import('../file-commands');
    await expect(listFiles('/path\0/foo')).rejects.toThrow('Invalid path');
  });
});

describe('saveFileContent', () => {
  it('calls write_managed_text_file with resolved path and content', async () => {
    tauriInvokeMock.mockResolvedValue('/resolved/server.properties');
    const { saveFileContent } = await import('../file-commands');
    await saveFileContent('/servers/server.properties', 'level-name=world');
    expect(tauriInvokeMock).toHaveBeenCalledWith('resolve_managed_path', {
      path: '/servers/server.properties',
    });
    expect(tauriInvokeMock).toHaveBeenCalledWith('write_managed_text_file', {
      path: '/resolved/server.properties',
      content: 'level-name=world',
    });
  });
});

describe('createFile', () => {
  it('creates empty file at resolved path', async () => {
    mockResolvePath();

    const { createFile } = await import('../file-commands');
    await createFile('/servers/default', 'newfile.txt');
    expect(tauriInvokeMock).toHaveBeenCalledWith('write_managed_text_file', {
      path: '/servers/default/newfile.txt',
      content: '',
    });
  });

  it('throws on empty name', async () => {
    const { createFile } = await import('../file-commands');
    await expect(createFile('/servers', '')).rejects.toThrow('Invalid file or folder name');
    await expect(createFile('/servers', '  ')).rejects.toThrow('Invalid file or folder name');
  });

  it('throws when name contains slash', async () => {
    const { createFile } = await import('../file-commands');
    await expect(createFile('/servers', 'a/b')).rejects.toThrow('Invalid file or folder name');
    await expect(createFile('/servers', 'a\\b')).rejects.toThrow('Invalid file or folder name');
  });

  it('throws when name contains ..', async () => {
    const { createFile } = await import('../file-commands');
    await expect(createFile('/servers', '..')).rejects.toThrow('Invalid file or folder name');
    await expect(createFile('/servers', 'a..b')).rejects.toThrow('Invalid file or folder name');
  });
});

describe('createFolder', () => {
  it('calls mkdir with recursive option', async () => {
    mockResolvePath();
    mkdirMock.mockResolvedValue(undefined);

    const { createFolder } = await import('../file-commands');
    await createFolder('/servers', 'myworld');
    expect(mkdirMock).toHaveBeenCalledWith('/servers/myworld', { recursive: true });
  });

  it('throws on invalid folder name', async () => {
    const { createFolder } = await import('../file-commands');
    await expect(createFolder('/servers', '')).rejects.toThrow('Invalid file or folder name');
  });
});

describe('deleteItem', () => {
  it('calls remove with resolved path and recursive', async () => {
    mockResolvePath();
    removeMock.mockResolvedValue(undefined);

    const { deleteItem } = await import('../file-commands');
    await deleteItem('/servers/old-world');
    expect(removeMock).toHaveBeenCalledWith('/servers/old-world', { recursive: true });
  });
});

describe('moveItem', () => {
  it('calls rename with both resolved paths', async () => {
    mockResolvePath();
    renameMock.mockResolvedValue(undefined);

    const { moveItem } = await import('../file-commands');
    await moveItem('/servers/a.txt', '/servers/b.txt');
    expect(renameMock).toHaveBeenCalledWith('/servers/a.txt', '/servers/b.txt');
  });
});

describe('readJsonFile', () => {
  it('returns parsed object when content is valid JSON object', async () => {
    tauriInvokeMock.mockResolvedValue(JSON.stringify({ key: 'value' }));

    const { readJsonFile } = await import('../file-commands');
    const result = await readJsonFile('/config.json');
    expect(result).toEqual({ key: 'value' });
  });

  it('returns parsed array when content is valid JSON array', async () => {
    tauriInvokeMock.mockResolvedValue(JSON.stringify([1, 2, 3]));

    const { readJsonFile } = await import('../file-commands');
    const result = await readJsonFile('/list.json');
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns null when content is primitive JSON', async () => {
    tauriInvokeMock.mockResolvedValue('42');

    const { readJsonFile } = await import('../file-commands');
    const result = await readJsonFile('/num.json');
    expect(result).toBeNull();
  });

  it('returns null when JSON parse fails', async () => {
    tauriInvokeMock.mockResolvedValue('{ invalid json }');

    const { readJsonFile } = await import('../file-commands');
    const result = await readJsonFile('/broken.json');
    expect(result).toBeNull();
  });

  it('returns null when tauriInvoke throws', async () => {
    tauriInvokeMock.mockRejectedValue(new Error('file not found'));

    const { readJsonFile } = await import('../file-commands');
    const result = await readJsonFile('/missing.json');
    expect(result).toBeNull();
  });
});

describe('writeJsonFile', () => {
  it('serializes data and writes via tauriInvoke', async () => {
    mockResolvePath();

    const { writeJsonFile } = await import('../file-commands');
    const data = { server: 'vanilla', port: 25565 };
    await writeJsonFile('/config.json', data);

    expect(tauriInvokeMock).toHaveBeenCalledWith('write_managed_text_file', {
      path: '/config.json',
      content: JSON.stringify(data, null, 2),
    });
  });

  it('serializes array data correctly', async () => {
    mockResolvePath();

    const { writeJsonFile } = await import('../file-commands');
    await writeJsonFile('/list.json', [1, 2, 3]);
    expect(tauriInvokeMock).toHaveBeenCalledWith('write_managed_text_file', {
      path: '/list.json',
      content: JSON.stringify([1, 2, 3], null, 2),
    });
  });
});

describe('importFile', () => {
  it('returns null when user cancels dialog', async () => {
    mockResolvePath();
    openMock.mockResolvedValue(null);

    const { importFile } = await import('../file-commands');
    const result = await importFile('/servers/plugins');
    expect(result).toBeNull();
    expect(copyFileMock).not.toHaveBeenCalled();
  });

  it('copies selected file and returns destination path', async () => {
    mockResolvePath();
    openMock.mockResolvedValue('/downloads/myplugin.jar');
    copyFileMock.mockResolvedValue(undefined);

    const { importFile } = await import('../file-commands');
    const result = await importFile('/servers/plugins');
    expect(copyFileMock).toHaveBeenCalledWith(
      '/downloads/myplugin.jar',
      '/servers/plugins/myplugin.jar',
    );
    expect(result).toBe('/servers/plugins/myplugin.jar');
  });
});
