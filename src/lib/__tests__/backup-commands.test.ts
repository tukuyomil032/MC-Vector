import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();
const tauriListenMock = vi.fn();
const readDirMock = vi.fn();
const listFilesWithMetadataMock = vi.fn();

vi.mock('../tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: tauriListenMock,
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: readDirMock,
  remove: vi.fn(),
}));

vi.mock('../file-commands', () => ({
  listFilesWithMetadata: listFilesWithMetadataMock,
}));

describe('backup-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
    tauriListenMock.mockReset();
    readDirMock.mockReset();
    listFilesWithMetadataMock.mockReset();
  });

  describe('createBackup', () => {
    it('invokes create_backup with null sources and default compression', async () => {
      tauriInvokeMock.mockResolvedValueOnce(undefined);
      const { createBackup } = await import('../backup-commands');
      await createBackup('/servers/s1', 'backup-2024');
      expect(tauriInvokeMock).toHaveBeenCalledWith('create_backup', {
        serverId: 'backup-2024',
        sourceDir: '/servers/s1',
        backupDir: '/servers/s1/backups',
        sources: null,
        compressionLevel: 5,
      });
    });

    it('passes sources and custom compression level when provided', async () => {
      tauriInvokeMock.mockResolvedValueOnce(undefined);
      const { createBackup } = await import('../backup-commands');
      await createBackup('/servers/s1', 'backup-2024', ['world', 'plugins'], 9);
      expect(tauriInvokeMock).toHaveBeenCalledWith('create_backup', {
        serverId: 'backup-2024',
        sourceDir: '/servers/s1',
        backupDir: '/servers/s1/backups',
        sources: ['world', 'plugins'],
        compressionLevel: 9,
      });
    });

    it('passes null for empty sources array', async () => {
      tauriInvokeMock.mockResolvedValueOnce(undefined);
      const { createBackup } = await import('../backup-commands');
      await createBackup('/servers/s1', 'backup-2024', []);
      expect(tauriInvokeMock).toHaveBeenCalledWith(
        'create_backup',
        expect.objectContaining({ sources: null }),
      );
    });
  });

  describe('listBackups', () => {
    it('returns zip file names filtered from backup directory', async () => {
      readDirMock.mockResolvedValueOnce([
        { name: 'backup1.zip' },
        { name: 'backup2.zip' },
        { name: 'readme.txt' },
      ]);
      const { listBackups } = await import('../backup-commands');
      const result = await listBackups('/servers/s1');
      expect(result).toEqual(['backup1.zip', 'backup2.zip']);
    });

    it('returns empty array when backup directory does not exist', async () => {
      readDirMock.mockRejectedValueOnce(new Error('directory not found'));
      const { listBackups } = await import('../backup-commands');
      const result = await listBackups('/servers/s1');
      expect(result).toEqual([]);
    });

    it('returns empty array when no zip files exist', async () => {
      readDirMock.mockResolvedValueOnce([{ name: 'notes.txt' }, { name: 'readme.md' }]);
      const { listBackups } = await import('../backup-commands');
      const result = await listBackups('/servers/s1');
      expect(result).toEqual([]);
    });
  });

  describe('restoreBackup', () => {
    it('invokes restore_backup with correct path construction', async () => {
      tauriInvokeMock.mockResolvedValueOnce(undefined);
      const { restoreBackup } = await import('../backup-commands');
      await restoreBackup('/servers/s1', 'backup-2024.zip');
      expect(tauriInvokeMock).toHaveBeenCalledWith('restore_backup', {
        backupPath: '/servers/s1/backups/backup-2024.zip',
        targetDir: '/servers/s1',
      });
    });
  });

  describe('onBackupProgress', () => {
    it('registers listener for backup-progress event and returns unlisten fn', async () => {
      const unlistenFn = vi.fn();
      tauriListenMock.mockResolvedValueOnce(unlistenFn);
      const { onBackupProgress } = await import('../backup-commands');
      const callback = vi.fn();
      const unlisten = await onBackupProgress(callback);
      expect(tauriListenMock).toHaveBeenCalledWith('backup-progress', callback);
      expect(unlisten).toBe(unlistenFn);
    });
  });
});
