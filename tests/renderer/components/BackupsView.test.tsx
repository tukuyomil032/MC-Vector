import { persistBackupCatalogBestEffort } from '@/renderer/components/BackupsView';
import BackupsView from '@/renderer/components/BackupsView';
import { useBackupOperationStore } from '@/store/backupOperationStore';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useLayoutEffect, useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  confirmMock,
  backupCommands,
  fileCommands,
  logErrorMock,
  toastErrorMock,
  toastSuccessMock,
  toastWarningMock,
} = vi.hoisted(() => {
  return {
    confirmMock: vi.fn(),
    backupCommands: {
      applyBackupRetention: vi.fn(),
      createBackup: vi.fn(),
      deleteBackup: vi.fn(),
      getBackupNameValidationError: vi.fn(),
      listBackupsWithMetadata: vi.fn(),
      readBackupCatalog: vi.fn(),
      restoreBackup: vi.fn(),
      writeBackupCatalog: vi.fn(),
    },
    fileCommands: {
      getManagedDirectorySize: vi.fn(),
    },
    logErrorMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastWarningMock: vi.fn(),
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 120,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, start: index * 120 })),
    measureElement: vi.fn(),
  }),
}));

vi.mock('@/components/arc/hold-to-confirm/hold-to-confirm', () => ({
  HoldToConfirm: ({
    label,
    onConfirm,
    disabled,
  }: {
    label: string;
    onConfirm: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onConfirm}>
      {label}
    </button>
  ),
}));

vi.mock('@/renderer/components/AppFeedbackProvider', () => ({
  useAppFeedback: () => ({ confirm: confirmMock }),
}));

vi.mock('@/renderer/shared/notify', () => ({
  notify: {
    error: toastErrorMock,
    success: toastSuccessMock,
    warning: toastWarningMock,
    info: vi.fn(),
  },
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    locale: 'en',
    setLocale: vi.fn(),
    t: (key: string, params?: { name?: string }) => {
      if (key === 'backups.confirmDelete') {
        return `Delete backup "${params?.name}"?`;
      }
      if (key === 'backups.deleteTitle') {
        return 'Delete Backup';
      }
      if (key === 'backups.confirmRestore') {
        return `Restore backup "${params?.name}"?`;
      }
      if (key === 'backups.restoreTitle') {
        return 'Restore Backup';
      }
      return key;
    },
  }),
}));

vi.mock('@/lib/backup-commands', () => backupCommands);
vi.mock('@/lib/error-utils', () => ({ logError: logErrorMock }));
vi.mock('@/lib/file-commands', () => fileCommands);
vi.mock('@/renderer/shared/auto-backup', () => ({
  buildManualBackupName: () => 'backup-name',
}));

const server = {
  id: 'server-1',
  name: 'Paper Server',
  path: '/managed/server-1',
  software: 'Paper',
  version: '1.21.4',
  status: 'offline' as const,
  port: 25565,
  memory: 2048,
  javaPath: 'java',
};

function renderStrictMode(serverOverride = server) {
  return render(
    <StrictMode>
      <BackupsView server={serverOverride} />
    </StrictMode>,
  );
}

function renderKeyedStrictMode(instanceKey: string, serverOverride = server) {
  return render(
    <StrictMode>
      <BackupsView key={instanceKey} server={serverOverride} />
    </StrictMode>,
  );
}

function LayoutSwitchHarness({
  onServerKeyChange,
  serverOverride,
}: {
  onServerKeyChange: () => void;
  serverOverride: typeof server;
}) {
  const previousServerKeyRef = useRef(`${serverOverride.id}\0${serverOverride.path}`);
  useLayoutEffect(() => {
    const nextServerKey = `${serverOverride.id}\0${serverOverride.path}`;
    if (previousServerKeyRef.current !== nextServerKey) {
      previousServerKeyRef.current = nextServerKey;
      onServerKeyChange();
    }
  }, [onServerKeyChange, serverOverride.id, serverOverride.path]);

  return <BackupsView server={serverOverride} />;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  confirmMock.mockResolvedValue(false);
  backupCommands.createBackup.mockResolvedValue({
    status: 'created',
    backupName: 'backup-name.zip',
    catalogError: null,
    restart: { status: 'not_needed' },
  });
  backupCommands.listBackupsWithMetadata.mockResolvedValue([]);
  backupCommands.readBackupCatalog.mockResolvedValue({});
  fileCommands.getManagedDirectorySize.mockResolvedValue({ bytes: 0, complete: true });
  useBackupOperationStore.setState({
    activeManualOperations: {},
    completionRevisions: {},
  });
});

describe('persistBackupCatalogBestEffort', () => {
  it('reports success without intercepting a successful catalog write', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const onFailure = vi.fn();

    await expect(persistBackupCatalogBestEffort(persist, onFailure)).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('reports metadata failure without turning it into a primary operation failure', async () => {
    const error = new Error('catalog unavailable');
    const persist = vi.fn().mockRejectedValue(error);
    const onFailure = vi.fn();

    await expect(persistBackupCatalogBestEffort(persist, onFailure)).resolves.toBe(false);
    expect(onFailure).toHaveBeenCalledWith(error);
  });
});

describe('BackupsView initialization', () => {
  it('initializes once under React.StrictMode', async () => {
    renderStrictMode();

    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalled());

    expect(backupCommands.listBackupsWithMetadata).toHaveBeenCalledOnce();
    expect(backupCommands.readBackupCatalog).toHaveBeenCalledOnce();
  });

  it('loads backups and then the catalog, in order', async () => {
    const calls: string[] = [];
    backupCommands.listBackupsWithMetadata.mockImplementation(async () => {
      calls.push('backups');
      return [];
    });
    backupCommands.readBackupCatalog.mockImplementation(async () => {
      calls.push('catalog');
      return {};
    });

    renderStrictMode();

    await waitFor(() => expect(calls).toEqual(['backups', 'catalog']));
  });

  it('treats a null catalog as an empty ready catalog', async () => {
    backupCommands.readBackupCatalog.mockResolvedValue(null);
    backupCommands.listBackupsWithMetadata
      .mockResolvedValueOnce([{ name: 'backup.zip', date: new Date(), size: 1 }])
      .mockResolvedValue([]);
    backupCommands.deleteBackup.mockResolvedValue(undefined);
    confirmMock.mockResolvedValue(true);

    renderStrictMode();
    await waitFor(() => expect(screen.getByTestId('backup-row-backup.zip')).toBeInTheDocument());

    const deleteButton = await waitFor(() => {
      const button = screen.getByRole('button', { name: 'common.delete' });
      expect(button).not.toBeDisabled();
      return button;
    });
    fireEvent.click(deleteButton);

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('backups.toast.deleted'));
    expect(confirmMock).toHaveBeenCalledOnce();
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete Backup',
        description: 'Delete backup "backup.zip"?',
        tone: 'danger',
      }),
    );
    expect(backupCommands.deleteBackup).toHaveBeenCalledOnce();
    expect(toastErrorMock).not.toHaveBeenCalledWith('backups.toast.catalogLoadFailed');
  }, 10_000);

  it('does not delete or update metadata when backup deletion is canceled', async () => {
    backupCommands.listBackupsWithMetadata.mockResolvedValue([
      { name: 'backup.zip', date: new Date(), size: 1 },
    ]);

    renderStrictMode();
    await waitFor(() => expect(screen.getByTestId('backup-row-backup.zip')).toBeInTheDocument());

    const deleteButton = await waitFor(() => {
      const button = screen.getByRole('button', { name: 'common.delete' });
      expect(button).not.toBeDisabled();
      return button;
    });
    fireEvent.click(deleteButton);

    await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce());
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete Backup',
        description: 'Delete backup "backup.zip"?',
        tone: 'danger',
      }),
    );
    expect(backupCommands.deleteBackup).not.toHaveBeenCalled();
    expect(backupCommands.writeBackupCatalog).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalledWith('backups.toast.deleted');
  });

  it('asks before restoring a backup and leaves the world alone when canceled', async () => {
    backupCommands.listBackupsWithMetadata.mockResolvedValue([
      { name: 'backup.zip', date: new Date(), size: 1 },
    ]);
    confirmMock.mockResolvedValue(false);

    renderStrictMode();
    await waitFor(() => expect(screen.getByTestId('backup-row-backup.zip')).toBeInTheDocument());

    const restoreButton = await waitFor(() => {
      const button = screen.getByRole('button', { name: 'backups.actions.restore' });
      expect(button).not.toBeDisabled();
      return button;
    });
    fireEvent.click(restoreButton);

    await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce());
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Restore Backup',
        description: 'Restore backup "backup.zip"?',
      }),
    );
    expect(backupCommands.restoreBackup).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalledWith('backups.toast.restored');
  });

  it('blocks delete while the catalog is loading and allows it once ready', async () => {
    const catalog = deferred<unknown>();
    backupCommands.listBackupsWithMetadata
      .mockResolvedValueOnce([{ name: 'backup.zip', date: new Date(), size: 1 }])
      .mockResolvedValue([]);
    backupCommands.readBackupCatalog.mockReturnValue(catalog.promise);
    backupCommands.deleteBackup.mockResolvedValue(undefined);
    confirmMock.mockResolvedValue(true);

    renderStrictMode();

    const deleteButton = await waitFor(() => screen.getByRole('button', { name: 'common.delete' }));
    expect(deleteButton).toBeDisabled();

    fireEvent.click(deleteButton);
    expect(backupCommands.deleteBackup).not.toHaveBeenCalled();

    await act(async () => {
      catalog.resolve({});
      await Promise.resolve();
    });

    await waitFor(() => expect(deleteButton).not.toBeDisabled());
    fireEvent.click(deleteButton);

    await waitFor(() =>
      expect(backupCommands.deleteBackup).toHaveBeenCalledWith(server.id, 'backup.zip'),
    );
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('backups.toast.deleted'));
  });

  it('keeps the newer completion catalog when the initial catalog resolves afterward', async () => {
    const initialCatalog = deferred<unknown>();
    backupCommands.listBackupsWithMetadata.mockResolvedValue([
      { name: 'catalog-race.zip', date: new Date(), size: 1 },
    ]);
    backupCommands.readBackupCatalog
      .mockReturnValueOnce(initialCatalog.promise)
      .mockResolvedValueOnce({
        entries: {
          'catalog-race.zip': {
            tags: ['new-catalog'],
            note: '',
            createdAt: '',
          },
        },
      });

    render(<BackupsView server={server} />);
    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledOnce());

    await act(async () => {
      useBackupOperationStore.setState({ completionRevisions: { [server.id]: 1 } });
    });

    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('new-catalog')).toBeInTheDocument());

    await act(async () => {
      initialCatalog.resolve({
        entries: {
          'catalog-race.zip': {
            tags: ['old-catalog'],
            note: '',
            createdAt: '',
          },
        },
      });
    });

    expect(screen.getByText('new-catalog')).toBeInTheDocument();
    expect(screen.queryByText('old-catalog')).not.toBeInTheDocument();
  });

  it('blocks manual creation while a completion refresh is waiting on its catalog', async () => {
    const completionCatalog = deferred<unknown>();
    backupCommands.readBackupCatalog
      .mockResolvedValueOnce({})
      .mockReturnValueOnce(completionCatalog.promise);
    backupCommands.listBackupsWithMetadata.mockResolvedValueOnce([]).mockReturnValueOnce([]);

    render(<BackupsView server={server} />);
    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledOnce());

    await act(async () => {
      useBackupOperationStore.setState({ completionRevisions: { [server.id]: 1 } });
    });

    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByTestId('backups-create-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('backups-create-submit'));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('backups.toast.catalogLoadFailed'),
    );
    expect(backupCommands.createBackup).not.toHaveBeenCalled();

    await act(async () => {
      completionCatalog.resolve({});
    });
  });

  it('keeps delete disabled after the catalog fails to load', async () => {
    const catalogError = new Error('catalog unavailable');
    backupCommands.listBackupsWithMetadata.mockResolvedValue([
      { name: 'backup.zip', date: new Date(), size: 1 },
    ]);
    backupCommands.readBackupCatalog.mockRejectedValue(catalogError);

    renderStrictMode();

    const deleteButton = await waitFor(() => screen.getByRole('button', { name: 'common.delete' }));
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('backups.toast.catalogLoadFailed'),
    );

    expect(deleteButton).toBeDisabled();
    fireEvent.click(deleteButton);
    expect(backupCommands.deleteBackup).not.toHaveBeenCalled();
  });

  it('shows one catalog error toast under React.StrictMode', async () => {
    backupCommands.readBackupCatalog.mockRejectedValue(new Error('permission denied'));

    renderStrictMode();

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());

    expect(backupCommands.readBackupCatalog).toHaveBeenCalledOnce();
    expect(toastErrorMock).toHaveBeenCalledOnce();
  });

  it('starts one fresh initialization when the server key changes', async () => {
    const view = renderStrictMode();
    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledOnce());

    const nextServer = { ...server, id: 'server-2', path: '/managed/server-2' };
    view.rerender(
      <StrictMode>
        <BackupsView server={nextServer} />
      </StrictMode>,
    );

    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledTimes(2));

    expect(backupCommands.listBackupsWithMetadata).toHaveBeenCalledTimes(2);
    expect(backupCommands.readBackupCatalog).toHaveBeenNthCalledWith(2, 'server-2');
  });

  it('ignores a stale first initialization after A to B to A changes', async () => {
    const firstA = deferred<Array<{ name: string; date: Date; size: number }>>();
    const b = deferred<never[]>();
    const secondA = deferred<Array<{ name: string; date: Date; size: number }>>();
    backupCommands.listBackupsWithMetadata
      .mockReturnValueOnce(firstA.promise)
      .mockReturnValueOnce(b.promise)
      .mockReturnValueOnce(secondA.promise);
    backupCommands.readBackupCatalog.mockRejectedValue(new Error('catalog unavailable'));

    const view = renderStrictMode();
    await waitFor(() => expect(backupCommands.listBackupsWithMetadata).toHaveBeenCalledTimes(1));

    view.rerender(
      <StrictMode>
        <BackupsView server={{ ...server, id: 'server-b', path: '/managed/server-b' }} />
      </StrictMode>,
    );
    await waitFor(() => expect(backupCommands.listBackupsWithMetadata).toHaveBeenCalledTimes(2));

    view.rerender(
      <StrictMode>
        <BackupsView server={server} />
      </StrictMode>,
    );
    await waitFor(() => expect(backupCommands.listBackupsWithMetadata).toHaveBeenCalledTimes(3));

    await act(async () => {
      b.resolve([]);
      secondA.resolve([{ name: 'new-a.zip', date: new Date(), size: 2 }]);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('backup-row-new-a.zip')).toBeInTheDocument());
    expect(backupCommands.readBackupCatalog).toHaveBeenCalledOnce();
    expect(toastErrorMock).toHaveBeenCalledOnce();

    await act(async () => {
      firstA.resolve([{ name: 'old-a.zip', date: new Date(), size: 1 }]);
      await Promise.resolve();
    });

    expect(backupCommands.readBackupCatalog).toHaveBeenCalledOnce();
    expect(toastErrorMock).toHaveBeenCalledOnce();
    expect(screen.getByTestId('backup-row-new-a.zip')).toBeInTheDocument();
    expect(screen.queryByTestId('backup-row-old-a.zip')).not.toBeInTheDocument();
  });

  it('invalidates a stale initialization before passive effects on a same-instance key change', async () => {
    const firstA = deferred<Array<{ name: string; date: Date; size: number }>>();
    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };
    const catalogServerIds: string[] = [];
    backupCommands.listBackupsWithMetadata
      .mockReturnValueOnce(firstA.promise)
      .mockResolvedValue([]);
    backupCommands.readBackupCatalog.mockImplementation(async (serverId: string) => {
      catalogServerIds.push(serverId);
      return {};
    });
    const resolveFirstA = () => {
      firstA.resolve([{ name: 'stale-a.zip', date: new Date(), size: 1 }]);
    };

    const view = render(
      <StrictMode>
        <LayoutSwitchHarness onServerKeyChange={resolveFirstA} serverOverride={server} />
      </StrictMode>,
    );
    await waitFor(() => expect(backupCommands.listBackupsWithMetadata).toHaveBeenCalledOnce());

    view.rerender(
      <StrictMode>
        <LayoutSwitchHarness onServerKeyChange={resolveFirstA} serverOverride={nextServer} />
      </StrictMode>,
    );

    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledOnce());
    expect(catalogServerIds).toEqual(['server-b']);
    expect(screen.queryByTestId('backup-row-stale-a.zip')).not.toBeInTheDocument();
  });

  it('clears old backup data before a new server listing fails', async () => {
    const nextServer = { ...server, id: 'server-2', path: '/managed/server-2' };
    const nextServerListing = deferred<never[]>();
    backupCommands.listBackupsWithMetadata.mockImplementation((serverId: string) => {
      if (serverId === nextServer.id) {
        return nextServerListing.promise;
      }
      return Promise.resolve([{ name: 'old-a.zip', date: new Date(), size: 1 }]);
    });

    const view = renderStrictMode();
    await waitFor(() => expect(screen.getByTestId('backup-row-old-a.zip')).toBeInTheDocument());

    view.rerender(
      <StrictMode>
        <BackupsView server={nextServer} />
      </StrictMode>,
    );

    expect(screen.queryByTestId('backup-row-old-a.zip')).not.toBeInTheDocument();

    await act(async () => {
      nextServerListing.reject(new Error('server B listing failed'));
      for (let index = 0; index < 4; index += 1) {
        await Promise.resolve();
      }
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('backups.toast.loadFailed'));
  });

  it('does not refresh or toast from a stale backup deletion operation', async () => {
    const deletion = deferred<void>();
    backupCommands.listBackupsWithMetadata
      .mockResolvedValueOnce([{ name: 'old-a.zip', date: new Date(), size: 1 }])
      .mockResolvedValue([]);
    backupCommands.deleteBackup.mockReturnValue(deletion.promise);
    confirmMock.mockResolvedValue(true);

    const view = renderStrictMode();
    await waitFor(() => expect(screen.getByTestId('backup-row-old-a.zip')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(backupCommands.deleteBackup).toHaveBeenCalledOnce());

    view.rerender(
      <StrictMode>
        <BackupsView server={{ ...server, id: 'server-b', path: '/managed/server-b' }} />
      </StrictMode>,
    );
    view.rerender(
      <StrictMode>
        <BackupsView server={server} />
      </StrictMode>,
    );
    await waitFor(() => expect(backupCommands.listBackupsWithMetadata).toHaveBeenCalledTimes(3));
    const listCallsBeforeStaleCompletion = backupCommands.listBackupsWithMetadata.mock.calls.length;

    await act(async () => {
      deletion.resolve();
      for (let index = 0; index < 6; index += 1) {
        await Promise.resolve();
      }
    });

    expect(backupCommands.listBackupsWithMetadata).toHaveBeenCalledTimes(
      listCallsBeforeStaleCompletion,
    );
    expect(toastSuccessMock).not.toHaveBeenCalledWith('backups.toast.deleted');
  });

  it('does not delete when confirmation becomes stale before the IPC call', async () => {
    const confirmation = deferred<boolean>();
    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };
    backupCommands.listBackupsWithMetadata.mockResolvedValue([
      { name: 'old-a.zip', date: new Date(), size: 1 },
    ]);
    confirmMock.mockReturnValue(confirmation.promise);

    const view = renderKeyedStrictMode('server-a', server);
    await waitFor(() => expect(screen.getByTestId('backup-row-old-a.zip')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce());

    view.rerender(
      <StrictMode>
        <BackupsView key="server-b" server={nextServer} />
      </StrictMode>,
    );
    await waitFor(() => expect(backupCommands.listBackupsWithMetadata).toHaveBeenCalledTimes(2));

    await act(async () => {
      confirmation.resolve(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backupCommands.deleteBackup).not.toHaveBeenCalled();
    expect(backupCommands.writeBackupCatalog).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalledWith('backups.toast.deleted');
  });
});

describe('BackupsView lifecycle', () => {
  it('asks before stopping a running server and retries creation only after consent', async () => {
    confirmMock.mockResolvedValue(true);
    backupCommands.createBackup
      .mockResolvedValueOnce({ status: 'confirmation_required' })
      .mockResolvedValueOnce({
        status: 'created',
        backupName: 'backup-name.zip',
        catalogError: null,
        restart: { status: 'restarted' },
      });
    backupCommands.applyBackupRetention.mockResolvedValue({
      deletedNames: [],
      failedDeleteCount: 0,
      listingFailed: false,
    });

    renderStrictMode();
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByTestId('backups-create-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('backups-create-submit'));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce());
    expect(backupCommands.createBackup).toHaveBeenNthCalledWith(
      1,
      server.id,
      'backup-name.zip',
      5,
      false,
    );
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'backups.stopForBackupTitle',
        description: 'backups.confirmStopForBackup',
      }),
    );
    await waitFor(() => expect(backupCommands.createBackup).toHaveBeenCalledTimes(2));
    expect(backupCommands.createBackup).toHaveBeenNthCalledWith(
      2,
      server.id,
      'backup-name.zip',
      5,
      true,
    );
  });

  it('does not retry or show success when stopping a running server is declined', async () => {
    backupCommands.createBackup.mockResolvedValueOnce({ status: 'confirmation_required' });
    confirmMock.mockResolvedValue(false);

    renderStrictMode();
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByTestId('backups-create-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('backups-create-submit'));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce());
    expect(backupCommands.createBackup).toHaveBeenCalledOnce();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('keeps a created backup successful and warns if restart or registry update failed', async () => {
    backupCommands.createBackup.mockResolvedValueOnce({
      status: 'created',
      backupName: 'backup-name.zip',
      catalogError: 'registry write failed',
      restart: { status: 'failed', error: 'process start failed' },
    });

    renderStrictMode();
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByTestId('backups-create-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('backups-create-submit'));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('backups.toast.created'));
    expect(toastWarningMock).toHaveBeenCalledWith('backups.toast.registryUpdateFailed');
    expect(toastWarningMock).toHaveBeenCalledWith('backups.toast.serverRestartFailed');
    expect(backupCommands.applyBackupRetention).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('reports stop failure without treating the attempt as a created backup', async () => {
    backupCommands.createBackup.mockResolvedValueOnce({
      status: 'failed',
      stage: 'stop',
      error: 'stop timed out',
      restartError: null,
    });

    renderStrictMode();
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByTestId('backups-create-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('backups-create-submit'));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('backups.toast.serverStopFailed'),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(backupCommands.applyBackupRetention).not.toHaveBeenCalled();
  });

  it('reports both missing backup and failed restart without using the created-backup warning', async () => {
    backupCommands.createBackup.mockResolvedValueOnce({
      status: 'failed',
      stage: 'backup',
      error: 'archive write failed',
      restartError: 'process start failed',
    });

    renderStrictMode();
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByTestId('backups-create-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('backups-create-submit'));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('backups.toast.backupNotCreatedRestartFailed'),
    );
    expect(toastErrorMock).not.toHaveBeenCalledWith('backups.toast.stoppedCreateFailed');
    expect(toastWarningMock).not.toHaveBeenCalledWith('backups.toast.serverRestartFailed');
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(logErrorMock).toHaveBeenCalledWith(
      'Manual backup operation failed',
      'archive write failed',
      expect.objectContaining({
        serverId: server.id,
        serverPath: server.path,
        stage: 'backup',
        restartError: 'process start failed',
      }),
    );
  });

  it('continues a manual backup through create IPC after a keyed unmount', async () => {
    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };
    const createPromise = deferred<{
      status: 'created';
      backupName: string;
      catalogError: null;
      restart: { status: 'not_needed' };
    }>();
    backupCommands.createBackup.mockReturnValue(createPromise.promise);
    backupCommands.applyBackupRetention.mockResolvedValue({
      deletedNames: [],
      failedDeleteCount: 0,
      listingFailed: false,
    });

    const view = renderKeyedStrictMode('server-a', server);
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByTestId('backups-create-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('backups-create-submit'));
    await waitFor(() =>
      expect(backupCommands.createBackup).toHaveBeenCalledWith(
        server.id,
        'backup-name.zip',
        5,
        false,
      ),
    );

    view.rerender(
      <StrictMode>
        <BackupsView key="server-b" server={nextServer} />
      </StrictMode>,
    );

    await act(async () => {
      createPromise.resolve({
        status: 'created',
        backupName: 'backup-name.zip',
        catalogError: null,
        restart: { status: 'not_needed' },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(backupCommands.createBackup).toHaveBeenCalledWith(
        server.id,
        'backup-name.zip',
        5,
        false,
      ),
    );
    expect(backupCommands.applyBackupRetention).toHaveBeenCalledWith(server.id, 0, 0);
    await waitFor(() => expect(backupCommands.writeBackupCatalog).toHaveBeenCalledOnce());
    expect(useBackupOperationStore.getState().activeManualOperations[server.id]).toBeUndefined();
    expect(useBackupOperationStore.getState().completionRevisions[server.id]).toBe(1);
  });

  it('shows a remounted server as creating and reloads after its manual operation completes', async () => {
    const createPromise = deferred<{
      status: 'created';
      backupName: string;
      catalogError: null;
      restart: { status: 'not_needed' };
    }>();
    backupCommands.createBackup.mockReturnValue(createPromise.promise);
    backupCommands.applyBackupRetention.mockResolvedValue({
      deletedNames: [],
      failedDeleteCount: 0,
      listingFailed: false,
    });

    const view = renderKeyedStrictMode('server-a', server);
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByTestId('backups-create-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('backups-create-submit'));
    await waitFor(() =>
      expect(backupCommands.createBackup).toHaveBeenCalledWith(
        server.id,
        'backup-name.zip',
        5,
        false,
      ),
    );

    view.rerender(
      <StrictMode>
        <BackupsView key="server-a-remounted" server={server} />
      </StrictMode>,
    );

    const createButton = await waitFor(() => screen.getByTestId('backups-create-button'));
    expect(createButton).toBeDisabled();
    expect(createButton).toHaveTextContent('backups.processing');
    const backupLoadsBeforeCompletion = backupCommands.listBackupsWithMetadata.mock.calls.length;
    const catalogLoadsBeforeCompletion = backupCommands.readBackupCatalog.mock.calls.length;

    await act(async () => {
      createPromise.resolve({
        status: 'created',
        backupName: 'backup-name.zip',
        catalogError: null,
        restart: { status: 'not_needed' },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(backupCommands.writeBackupCatalog).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(backupCommands.listBackupsWithMetadata.mock.calls.length).toBeGreaterThan(
        backupLoadsBeforeCompletion,
      ),
    );
    await waitFor(() =>
      expect(backupCommands.readBackupCatalog.mock.calls.length).toBeGreaterThan(
        catalogLoadsBeforeCompletion,
      ),
    );
    expect(createButton).not.toBeDisabled();
  });

  it('finishes the manual operation when create backup fails', async () => {
    backupCommands.createBackup.mockRejectedValue(new Error('create failed'));

    renderStrictMode();
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByTestId('backups-create-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('backups-create-submit'));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('backups.toast.createFailed'));
    expect(useBackupOperationStore.getState().activeManualOperations[server.id]).toBeUndefined();
    expect(useBackupOperationStore.getState().completionRevisions[server.id]).toBe(1);
  });

  it('ignores a catalog rejection after a keyed instance is unmounted', async () => {
    const oldCatalog = deferred<unknown>();
    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };
    backupCommands.readBackupCatalog
      .mockReturnValueOnce(oldCatalog.promise)
      .mockResolvedValueOnce({});

    const view = renderKeyedStrictMode('server-a', server);
    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledOnce());

    view.rerender(
      <StrictMode>
        <BackupsView key="server-b" server={nextServer} />
      </StrictMode>,
    );
    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledTimes(2));

    await act(async () => {
      oldCatalog.reject(new Error('old catalog rejected after unmount'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it('ignores a backup deletion completion after a keyed instance is unmounted', async () => {
    const deletion = deferred<void>();
    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };
    backupCommands.listBackupsWithMetadata
      .mockResolvedValueOnce([{ name: 'old-a.zip', date: new Date(), size: 1 }])
      .mockResolvedValue([]);
    backupCommands.deleteBackup.mockReturnValue(deletion.promise);
    confirmMock.mockResolvedValue(true);

    const view = renderKeyedStrictMode('server-a', server);
    await waitFor(() => expect(screen.getByTestId('backup-row-old-a.zip')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(backupCommands.deleteBackup).toHaveBeenCalledOnce());

    view.rerender(
      <StrictMode>
        <BackupsView key="server-b" server={nextServer} />
      </StrictMode>,
    );
    await waitFor(() => expect(backupCommands.listBackupsWithMetadata).toHaveBeenCalledTimes(2));

    await act(async () => {
      deletion.resolve();
      for (let index = 0; index < 6; index += 1) {
        await Promise.resolve();
      }
    });

    expect(backupCommands.listBackupsWithMetadata).toHaveBeenCalledTimes(2);
    expect(toastSuccessMock).not.toHaveBeenCalledWith('backups.toast.deleted');
    expect(logErrorMock).not.toHaveBeenCalled();
  });
});

describe('backup folder sizes and the create estimate', () => {
  beforeEach(() => {
    backupCommands.listBackupsWithMetadata.mockResolvedValue([]);
  });

  it('shows the server folder size and an estimate when past backups recorded durations', async () => {
    backupCommands.listBackupsWithMetadata.mockResolvedValue([
      { name: 'old.zip', date: new Date(), size: 1_000_000, durationMs: 2000 },
    ]);
    fileCommands.getManagedDirectorySize.mockResolvedValue({ bytes: 5_000_000, complete: true });

    renderStrictMode();
    await waitFor(() => expect(screen.getByTestId('backup-row-old.zip')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('backups-create-button'));

    await waitFor(() =>
      expect(screen.getByTestId('backups-target-size')).toHaveTextContent('4.8 MB'),
    );
    expect(screen.getByTestId('backups-estimated-time')).toBeInTheDocument();
    expect(fileCommands.getManagedDirectorySize).toHaveBeenCalledWith(server.path);
  });

  it('hides the estimate when no past backup has a recorded duration', async () => {
    backupCommands.listBackupsWithMetadata.mockResolvedValue([
      { name: 'legacy.zip', date: new Date(), size: 1_000_000 },
    ]);
    fileCommands.getManagedDirectorySize.mockResolvedValue({ bytes: 5_000_000, complete: true });

    renderStrictMode();
    await waitFor(() => expect(screen.getByTestId('backup-row-legacy.zip')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('backups-create-button'));

    await waitFor(() =>
      expect(screen.getByTestId('backups-target-size')).toHaveTextContent('4.8 MB'),
    );
    expect(screen.queryByTestId('backups-estimated-time')).not.toBeInTheDocument();
  });
});
