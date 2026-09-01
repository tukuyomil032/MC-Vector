import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();
const tauriListenMock = vi.fn();

vi.mock('../tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: tauriListenMock,
}));

beforeEach(() => {
  vi.resetModules();
  tauriInvokeMock.mockReset();
  tauriListenMock.mockReset();
  tauriInvokeMock.mockResolvedValue(undefined);
});

describe('backup-commands', () => {
  it('creates a backup with server ID and relative sources only', async () => {
    const { createBackup } = await import('../backup-commands');
    await createBackup('server-1', 'backup-2024', ['world', 'plugins'], 9);
    expect(tauriInvokeMock).toHaveBeenCalledWith('create_managed_backup', {
      serverId: 'server-1',
      backupName: 'backup-2024',
      sources: ['world', 'plugins'],
      compressionLevel: 9,
    });
  });

  it('normalizes an empty source list to null', async () => {
    const { createBackup } = await import('../backup-commands');
    await createBackup('server-1', 'backup-2024', []);
    expect(tauriInvokeMock).toHaveBeenCalledWith('create_managed_backup', {
      serverId: 'server-1',
      backupName: 'backup-2024',
      sources: null,
      compressionLevel: 5,
    });
  });

  it('lists backups through the managed metadata command', async () => {
    tauriInvokeMock.mockResolvedValueOnce([
      { name: 'backup1.zip', isDirectory: false, size: 10, modified: 100 },
      { name: 'notes.txt', isDirectory: false, size: 2, modified: 200 },
    ]);
    const { listBackupsWithMetadata } = await import('../backup-commands');
    await expect(listBackupsWithMetadata('server-1')).resolves.toEqual([
      { name: 'backup1.zip', date: new Date(100_000), size: 10 },
    ]);
    expect(tauriInvokeMock).toHaveBeenCalledWith('list_dir_with_metadata', {
      request: { root: 'backups', serverId: 'server-1', relativePath: '' },
    });
  });

  it('returns an empty list when the managed directory is unavailable', async () => {
    tauriInvokeMock.mockRejectedValueOnce(new Error('directory not found'));
    const { listBackups } = await import('../backup-commands');
    await expect(listBackups('server-1')).resolves.toEqual([]);
  });

  it('restores a validated backup name through the managed command', async () => {
    const { restoreBackup } = await import('../backup-commands');
    await restoreBackup('server-1', 'backup-2024.zip');
    expect(tauriInvokeMock).toHaveBeenCalledWith('restore_managed_backup', {
      serverId: 'server-1',
      backupName: 'backup-2024.zip',
    });
  });

  it('rejects traversal in backup names before IPC', async () => {
    const { restoreBackup, deleteBackup } = await import('../backup-commands');
    await expect(restoreBackup('server-1', '../outside.zip')).rejects.toThrow(
      'Invalid backup name',
    );
    await expect(deleteBackup('server-1', 'nested/backup.zip')).rejects.toThrow(
      'Invalid backup name',
    );
    expect(tauriInvokeMock).not.toHaveBeenCalled();
  });

  it('deletes a backup using a typed managed request', async () => {
    const { deleteBackup } = await import('../backup-commands');
    await deleteBackup('server-1', 'backup-2024.zip');
    expect(tauriInvokeMock).toHaveBeenCalledWith('delete_managed_path', {
      request: { root: 'backups', serverId: 'server-1', relativePath: 'backup-2024.zip' },
    });
  });

  it('registers backup progress listeners', async () => {
    const unlisten = vi.fn();
    tauriListenMock.mockResolvedValueOnce(unlisten);
    const { onBackupProgress } = await import('../backup-commands');
    const callback = vi.fn();
    await expect(onBackupProgress(callback)).resolves.toBe(unlisten);
    expect(tauriListenMock).toHaveBeenCalledWith('backup-progress', callback);
  });
});
