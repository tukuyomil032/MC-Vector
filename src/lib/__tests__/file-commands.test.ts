import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();
const appDataDirMock = vi.fn();

vi.mock('@tauri-apps/api/path', () => ({ appDataDir: appDataDirMock }));
vi.mock('../tauri-api', () => ({ tauriInvoke: tauriInvokeMock, tauriListen: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: vi.fn() }));

const serverRoot = '/app-data/servers/s1';

beforeEach(() => {
  vi.resetModules();
  tauriInvokeMock.mockReset();
  appDataDirMock.mockReset();
  appDataDirMock.mockResolvedValue('/app-data');
  tauriInvokeMock.mockImplementation((command: string) => {
    if (command === 'resolve_managed_path') {
      return Promise.resolve('/resolved/managed/path');
    }
    return Promise.resolve(undefined);
  });
});

describe('managed file commands', () => {
  it('lists through the typed managed path contract', async () => {
    tauriInvokeMock.mockImplementation((command: string) => {
      if (command === 'resolve_managed_path') return Promise.resolve('/resolved');
      if (command === 'list_dir_with_metadata') {
        return Promise.resolve([{ name: 'server.jar', isDirectory: false, size: 10, modified: 1 }]);
      }
      return Promise.resolve(undefined);
    });
    const { listFiles } = await import('../file-commands');
    await expect(listFiles(serverRoot)).resolves.toEqual([
      { name: 'server.jar', isDirectory: false, size: 10, modified: 1 },
    ]);
    expect(tauriInvokeMock).toHaveBeenCalledWith('list_dir_with_metadata', {
      request: { root: 'servers', serverId: 's1', relativePath: '' },
    });
  });

  it('rejects paths outside app-managed storage before IPC', async () => {
    const { listFiles } = await import('../file-commands');
    await expect(listFiles('/tmp/outside')).rejects.toThrow('outside MC-Vector managed storage');
    expect(tauriInvokeMock).not.toHaveBeenCalled();
  });

  it('rejects traversal and missing paths', async () => {
    const { listFiles, createFile } = await import('../file-commands');
    await expect(listFiles(`${serverRoot}/../outside`)).rejects.toThrow('Path traversal');
    await expect(createFile(serverRoot, '')).rejects.toThrow('Invalid file or folder name');
  });

  it('writes, creates, deletes, and moves using managed requests', async () => {
    const { saveFileContent, createFile, createFolder, deleteItem, moveItem } = await import(
      '../file-commands'
    );
    await saveFileContent(`${serverRoot}/server.properties`, 'level-name=world');
    await createFile(serverRoot, 'new.txt');
    await createFolder(serverRoot, 'world');
    await deleteItem(`${serverRoot}/old.txt`);
    await moveItem(`${serverRoot}/old.txt`, `${serverRoot}/new.txt`);

    expect(tauriInvokeMock).toHaveBeenCalledWith('write_managed_text_file', {
      request: { root: 'servers', serverId: 's1', relativePath: 'server.properties' },
      content: 'level-name=world',
    });
    expect(tauriInvokeMock).toHaveBeenCalledWith('create_managed_directory', {
      request: { root: 'servers', serverId: 's1', relativePath: 'world' },
    });
    expect(tauriInvokeMock).toHaveBeenCalledWith('delete_managed_path', {
      request: { root: 'servers', serverId: 's1', relativePath: 'old.txt' },
    });
    expect(tauriInvokeMock).toHaveBeenCalledWith('move_managed_path', {
      from: { root: 'servers', serverId: 's1', relativePath: 'old.txt' },
      to: { root: 'servers', serverId: 's1', relativePath: 'new.txt' },
    });
  });

  it('uses a native Rust picker for imports', async () => {
    tauriInvokeMock.mockImplementation((command: string) => {
      if (command === 'resolve_managed_path') return Promise.resolve('/resolved');
      if (command === 'import_managed_files') {
        return Promise.resolve([
          { serverId: 's1', relativePath: 'plugins/example.jar', isDirectory: false, size: 42 },
        ]);
      }
      return Promise.resolve(undefined);
    });
    const { importFile, importFilesFromPaths } = await import('../file-commands');
    await expect(importFile(`${serverRoot}/plugins`)).resolves.toBe(
      `${serverRoot}/plugins/example.jar`,
    );
    await expect(
      importFilesFromPaths(['/arbitrary/source.jar'], `${serverRoot}/plugins`),
    ).resolves.toEqual([`${serverRoot}/plugins/example.jar`]);
    expect(tauriInvokeMock).not.toHaveBeenCalledWith(
      'import_managed_files_from_paths',
      expect.anything(),
    );
  });

  it('serializes JSON through the managed text command', async () => {
    const { readJsonFile, writeJsonFile } = await import('../file-commands');
    tauriInvokeMock.mockImplementation((command: string) => {
      if (command === 'resolve_managed_path') return Promise.resolve('/resolved');
      if (command === 'read_managed_text_file') return Promise.resolve('{"key":"value"}');
      return Promise.resolve(undefined);
    });
    await expect(readJsonFile(`${serverRoot}/config.json`)).resolves.toEqual({ key: 'value' });
    await writeJsonFile(`${serverRoot}/config.json`, [1, 2, 3]);
    expect(tauriInvokeMock).toHaveBeenCalledWith('write_managed_text_file', {
      request: { root: 'servers', serverId: 's1', relativePath: 'config.json' },
      content: '[\n  1,\n  2,\n  3\n]',
    });
  });
});
