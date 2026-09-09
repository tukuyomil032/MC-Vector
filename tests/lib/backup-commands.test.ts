import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();
const tauriListenMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({
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
  it('reads the backup catalog from the managed backup root', async () => {
    tauriInvokeMock.mockResolvedValueOnce(JSON.stringify({ entries: {} }));
    const { readBackupCatalog } = await import('@/lib/backup-commands');

    await expect(readBackupCatalog('server-1')).resolves.toEqual({ entries: {} });
    expect(tauriInvokeMock).toHaveBeenCalledWith('read_managed_text_file', {
      request: {
        root: 'backups',
        serverId: 'server-1',
        relativePath: '.mc-vector-backup-meta.json',
      },
    });
  });

  it('falls back to the legacy managed server catalog when the new catalog is unavailable', async () => {
    tauriInvokeMock
      .mockRejectedValueOnce(new Error('Path not found: .mc-vector-backup-meta.json'))
      .mockResolvedValueOnce(JSON.stringify({ lastBackupName: 'legacy.zip' }));
    const { readBackupCatalog } = await import('@/lib/backup-commands');

    await expect(readBackupCatalog('server-1')).resolves.toEqual({
      lastBackupName: 'legacy.zip',
    });
    expect(tauriInvokeMock).toHaveBeenNthCalledWith(2, 'read_managed_text_file', {
      request: {
        root: 'servers',
        serverId: 'server-1',
        relativePath: 'backups/.mc-vector-backup-meta.json',
      },
    });
  });

  it('falls back when localized Windows reports that the catalog file cannot be found', async () => {
    tauriInvokeMock
      .mockRejectedValueOnce(
        new Error(
          '[Tauri] read_managed_text_file failed: 指定されたファイルが見つかりません。 (os error 2)',
        ),
      )
      .mockResolvedValueOnce(JSON.stringify({ lastBackupName: 'legacy.zip' }));
    const { readBackupCatalog } = await import('@/lib/backup-commands');

    await expect(readBackupCatalog('server-1')).resolves.toEqual({
      lastBackupName: 'legacy.zip',
    });
    expect(tauriInvokeMock).toHaveBeenCalledTimes(2);
  });

  it('propagates a current catalog read error without trying the legacy path', async () => {
    tauriInvokeMock.mockRejectedValueOnce(new Error('Permission denied'));
    const { readBackupCatalog } = await import('@/lib/backup-commands');

    await expect(readBackupCatalog('server-1')).rejects.toThrow('Permission denied');
    expect(tauriInvokeMock).toHaveBeenCalledTimes(1);
  });

  it('propagates invalid current catalog JSON without trying the legacy path', async () => {
    tauriInvokeMock.mockResolvedValueOnce('{invalid json');
    const { readBackupCatalog } = await import('@/lib/backup-commands');

    await expect(readBackupCatalog('server-1')).rejects.toThrow(SyntaxError);
    expect(tauriInvokeMock).toHaveBeenCalledTimes(1);
  });

  it('returns an empty catalog when the wrapped current and legacy paths are missing', async () => {
    tauriInvokeMock
      .mockRejectedValueOnce(
        new Error(
          '[Tauri] read_managed_text_file failed: Failed to read file: No such file or directory (os error 2)',
        ),
      )
      .mockRejectedValueOnce(
        new Error('[Tauri] read_managed_text_file failed: Managed path parent does not exist'),
      );
    const { readBackupCatalog } = await import('@/lib/backup-commands');

    await expect(readBackupCatalog('server-1')).resolves.toBeNull();
    expect(tauriInvokeMock).toHaveBeenCalledTimes(2);
  });

  it('attempts each missing catalog path exactly once in current-then-legacy order', async () => {
    tauriInvokeMock
      .mockRejectedValueOnce(new Error('Managed path parent does not exist'))
      .mockRejectedValueOnce(new Error('MANAGED PATH PARENT DOES NOT EXIST'));
    const { readBackupCatalog } = await import('@/lib/backup-commands');

    await expect(readBackupCatalog('server-1')).resolves.toBeNull();
    expect(tauriInvokeMock).toHaveBeenCalledTimes(2);
    expect(tauriInvokeMock).toHaveBeenNthCalledWith(1, 'read_managed_text_file', {
      request: {
        root: 'backups',
        serverId: 'server-1',
        relativePath: '.mc-vector-backup-meta.json',
      },
    });
    expect(tauriInvokeMock).toHaveBeenNthCalledWith(2, 'read_managed_text_file', {
      request: {
        root: 'servers',
        serverId: 'server-1',
        relativePath: 'backups/.mc-vector-backup-meta.json',
      },
    });
  });

  it('writes the backup catalog only to the managed backup root', async () => {
    const catalog = { lastBackupName: 'backup.zip', entries: {} };
    const { writeBackupCatalog } = await import('@/lib/backup-commands');

    await writeBackupCatalog('server-1', catalog);
    expect(tauriInvokeMock).toHaveBeenCalledWith('write_managed_text_file', {
      request: {
        root: 'backups',
        serverId: 'server-1',
        relativePath: '.mc-vector-backup-meta.json',
      },
      content: JSON.stringify(catalog, null, 2),
    });
    expect(tauriInvokeMock).not.toHaveBeenCalledWith('write_managed_text_file', {
      request: {
        root: 'servers',
        serverId: 'server-1',
        relativePath: 'backups/.mc-vector-backup-meta.json',
      },
      content: expect.any(String),
    });
  });

  it('creates a full backup with server ID and compression level', async () => {
    const { createBackup } = await import('@/lib/backup-commands');
    await createBackup('server-1', 'backup-2024', 9);
    expect(tauriInvokeMock).toHaveBeenCalledWith('create_managed_backup', {
      serverId: 'server-1',
      backupName: 'backup-2024',
      sources: null,
      compressionLevel: 9,
    });
  });

  it('uses the default compression level when omitted', async () => {
    const { createBackup } = await import('@/lib/backup-commands');
    await createBackup('server-1', 'backup-2024');
    expect(tauriInvokeMock).toHaveBeenCalledWith('create_managed_backup', {
      serverId: 'server-1',
      backupName: 'backup-2024',
      sources: null,
      compressionLevel: 5,
    });
  });

  it('lists backups through the managed metadata command', async () => {
    tauriInvokeMock.mockResolvedValueOnce([
      {
        backupId: 'backup-1',
        archivePath: 'backup1.zip',
        origin: 'manual',
        consistency: 'quiesced',
        createdAt: '100000',
        totalBytes: 10,
        restoreEligible: true,
      },
    ]);
    const { listBackupsWithMetadata } = await import('@/lib/backup-commands');
    await expect(listBackupsWithMetadata('server-1')).resolves.toEqual([
      {
        name: 'backup1.zip',
        date: new Date(100_000),
        size: 10,
        backupId: 'backup-1',
        origin: 'manual',
        consistency: 'quiesced',
        restoreEligible: true,
      },
    ]);
    expect(tauriInvokeMock).toHaveBeenCalledWith('list_managed_backups', { serverId: 'server-1' });
  });

  it('returns an empty metadata list when the managed directory is missing', async () => {
    tauriInvokeMock
      .mockRejectedValueOnce(
        new Error('[Tauri] list_dir_with_metadata failed: Directory does not exist'),
      )
      .mockRejectedValueOnce(
        new Error('[Tauri] list_dir_with_metadata failed: Directory does not exist'),
      );
    const { listBackups, listBackupsWithMetadata } = await import('@/lib/backup-commands');
    await expect(listBackupsWithMetadata('server-1')).resolves.toEqual([]);
    await expect(listBackups('server-1')).resolves.toEqual([]);
  });

  it('returns an empty metadata list for a missing server backup parent', async () => {
    tauriInvokeMock
      .mockRejectedValueOnce(new Error('Managed path parent does not exist'))
      .mockRejectedValueOnce(
        new Error('[Tauri] list_dir_with_metadata failed: Managed path parent does not exist'),
      );
    const { listBackups, listBackupsWithMetadata } = await import('@/lib/backup-commands');

    await expect(listBackupsWithMetadata('server-1')).resolves.toEqual([]);
    await expect(listBackups('server-1')).resolves.toEqual([]);
    expect(tauriInvokeMock).toHaveBeenCalledTimes(2);
  });

  it('returns an empty metadata list for a localized Windows missing path', async () => {
    tauriInvokeMock.mockRejectedValueOnce(
      new Error(
        '[Tauri] list_dir_with_metadata failed: 指定されたパスが見つかりません。 (os error 3)',
      ),
    );
    const { listBackupsWithMetadata } = await import('@/lib/backup-commands');

    await expect(listBackupsWithMetadata('server-1')).resolves.toEqual([]);
    expect(tauriInvokeMock).toHaveBeenCalledTimes(1);
  });

  it('propagates genuine errors from metadata listing', async () => {
    tauriInvokeMock.mockRejectedValueOnce(
      new Error('[Tauri] list_dir_with_metadata failed: Permission denied'),
    );
    const { listBackupsWithMetadata } = await import('@/lib/backup-commands');

    await expect(listBackupsWithMetadata('server-1')).rejects.toThrow('Permission denied');
  });

  it('propagates genuine errors from backup listing', async () => {
    tauriInvokeMock.mockRejectedValueOnce(
      new Error('[Tauri] list_dir_with_metadata failed: Permission denied'),
    );
    const { listBackups } = await import('@/lib/backup-commands');

    await expect(listBackups('server-1')).rejects.toThrow('Permission denied');
  });

  it('applies retention through the authoritative managed command', async () => {
    tauriInvokeMock.mockImplementation(async (command: string) => {
      if (command === 'apply_managed_backup_retention') {
        return { deletedNames: ['old.zip'], failedDeleteCount: 0, records: [] };
      }
      return undefined;
    });
    const { applyBackupRetention } = await import('@/lib/backup-commands');

    await expect(applyBackupRetention('server-1', 2, 0)).resolves.toEqual({
      deletedNames: ['old.zip'],
      failedDeleteCount: 0,
      listingFailed: false,
    });
    expect(tauriInvokeMock).toHaveBeenCalledWith('apply_managed_backup_retention', {
      serverId: 'server-1',
      retainCount: 2,
      retainDays: 0,
    });
  });

  it('keeps retention failures separate from the backup operation', async () => {
    tauriInvokeMock.mockImplementation(async (command: string) => {
      if (command === 'apply_managed_backup_retention') {
        return { deletedNames: [], failedDeleteCount: 1, records: [] };
      }
      return undefined;
    });
    const { applyBackupRetention } = await import('@/lib/backup-commands');

    await expect(applyBackupRetention('server-1', 1, 1)).resolves.toEqual({
      deletedNames: [],
      failedDeleteCount: 1,
      listingFailed: false,
    });
  });

  it('reports retention listing failures without throwing', async () => {
    tauriInvokeMock.mockRejectedValueOnce(new Error('Permission denied'));
    const { applyBackupRetention } = await import('@/lib/backup-commands');

    await expect(applyBackupRetention('server-1', 2, 0)).resolves.toEqual({
      deletedNames: [],
      failedDeleteCount: 0,
      listingFailed: true,
    });
  });

  it('restores a validated backup name through the managed command', async () => {
    const { restoreBackup } = await import('@/lib/backup-commands');
    await restoreBackup('server-1', 'backup-2024.zip');
    expect(tauriInvokeMock).toHaveBeenCalledWith('restore_managed_backup', {
      serverId: 'server-1',
      backupName: 'backup-2024.zip',
    });
  });

  it('rejects traversal in backup names before IPC', async () => {
    const { restoreBackup, deleteBackup } = await import('@/lib/backup-commands');
    await expect(restoreBackup('server-1', '@/lib/outside.zip')).rejects.toThrow(
      'Invalid backup name',
    );
    await expect(deleteBackup('server-1', 'nested/backup.zip')).rejects.toThrow(
      'Invalid backup name',
    );
    expect(tauriInvokeMock).not.toHaveBeenCalled();
  });

  it('rejects Windows-invalid names before restore or delete IPC', async () => {
    const { restoreBackup, deleteBackup } = await import('@/lib/backup-commands');

    for (const character of ['*', '?', '"', '<', '>', '|']) {
      await expect(restoreBackup('server-1', `backup${character}.zip`)).rejects.toThrow(
        'Invalid backup name',
      );
      await expect(deleteBackup('server-1', `backup${character}.zip`)).rejects.toThrow(
        'Invalid backup name',
      );
    }
    expect(tauriInvokeMock).not.toHaveBeenCalled();
  });

  it('rejects unsafe backup creation names before IPC', async () => {
    const { createBackup, getBackupNameValidationError } = await import('@/lib/backup-commands');

    expect(getBackupNameValidationError('backup:2024')).toBe('unsafeCharacters');
    for (const character of ['*', '?', '"', '<', '>', '|']) {
      expect(getBackupNameValidationError(`backup${character}2024`)).toBe('unsafeCharacters');
    }
    await expect(createBackup('server-1', 'backup:2024')).rejects.toThrow('Invalid backup name');
    expect(tauriInvokeMock).not.toHaveBeenCalled();
  });

  it('normalizes selected backup sources to minimal safe roots', async () => {
    const { normalizeBackupSources } = await import('@/lib/backup-commands');

    expect(
      normalizeBackupSources([
        'world/level.dat',
        'world\\region\\r.0.0.mca',
        'world',
        'plugins',
        'plugins',
        'backups',
        'backups/old.zip',
        'Backups/new.zip',
        'BACKUPS/archive.zip',
        'Backups',
      ]),
    ).toEqual(['plugins', 'world']);
  });

  it('rejects absolute, UNC, and drive-style source paths before normalization', async () => {
    const { normalizeBackupSources } = await import('@/lib/backup-commands');

    expect(
      normalizeBackupSources([
        '/world/level.dat',
        '\\\\server\\share\\world',
        'C:\\server\\world',
        'D:/server/world',
        'world\\region\\r.0.0.mca',
      ]),
    ).toEqual(['world/region/r.0.0.mca']);
  });

  it('deletes a backup using a typed managed request', async () => {
    const { deleteBackup } = await import('@/lib/backup-commands');
    await deleteBackup('server-1', 'backup-2024.zip');
    expect(tauriInvokeMock).toHaveBeenCalledWith('delete_managed_backup', {
      serverId: 'server-1',
      backupName: 'backup-2024.zip',
    });
  });

  it('registers backup progress listeners', async () => {
    const unlisten = vi.fn();
    tauriListenMock.mockResolvedValueOnce(unlisten);
    const { onBackupProgress } = await import('@/lib/backup-commands');
    const callback = vi.fn();
    await expect(onBackupProgress(callback)).resolves.toBe(unlisten);
    expect(tauriListenMock).toHaveBeenCalledWith('backup-progress', callback);
  });
});
