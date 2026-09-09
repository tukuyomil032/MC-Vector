import { persistBackupCatalogBestEffort } from '@/renderer/components/BackupsView';
import BackupsView from '@/renderer/components/BackupsView';
import { useBackupOperationStore } from '@/store/backupOperationStore';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useLayoutEffect, useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  askMock,
  backupCommands,
  fileCommands,
  logErrorMock,
  registeredTauriHandlers,
  selectorWindowInstances,
  onceRegistrationResults,
  tauriListenMock,
  toastErrorMock,
  toastSuccessMock,
  webviewWindowMock,
} = vi.hoisted(() => {
  const selectorWindowInstances: Array<{
    emit: ReturnType<typeof vi.fn>;
    label: string;
    once: ReturnType<typeof vi.fn>;
    setFocus: ReturnType<typeof vi.fn>;
  }> = [];
  const onceRegistrationResults: Array<Promise<() => void>> = [];

  class MockWebviewWindow {
    static getByLabel = vi.fn();
    emit = vi.fn().mockResolvedValue(undefined);
    once = vi.fn((_event: string, _handler: unknown) => {
      return onceRegistrationResults.shift() ?? Promise.resolve(vi.fn());
    });
    setFocus = vi.fn().mockResolvedValue(undefined);
    label: string;

    constructor(label: string, _options: unknown) {
      this.label = label;
      selectorWindowInstances.push(this);
    }
  }

  const registeredTauriHandlers: Array<{ event: string; handler: unknown }> = [];

  return {
    askMock: vi.fn(),
    backupCommands: {
      applyBackupRetention: vi.fn(),
      createBackup: vi.fn(),
      deleteBackup: vi.fn(),
      getBackupNameValidationError: vi.fn(),
      listBackupsWithMetadata: vi.fn(),
      normalizeBackupSources: vi.fn((paths: readonly string[]) => Array.from(new Set(paths))),
      readBackupCatalog: vi.fn(),
      restoreBackup: vi.fn(),
      writeBackupCatalog: vi.fn(),
    },
    fileCommands: {
      deleteItem: vi.fn(),
      listFiles: vi.fn(),
      listFilesWithMetadata: vi.fn(),
    },
    logErrorMock: vi.fn(),
    registeredTauriHandlers,
    selectorWindowInstances,
    onceRegistrationResults,
    tauriListenMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    webviewWindowMock: MockWebviewWindow,
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

vi.mock('@tauri-apps/api/webviewWindow', () => ({ WebviewWindow: webviewWindowMock }));

vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: askMock }));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
    warning: vi.fn(),
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
      return key;
    },
  }),
}));

vi.mock('@/lib/backup-commands', () => backupCommands);
vi.mock('@/lib/error-utils', () => ({ logError: logErrorMock }));
vi.mock('@/lib/file-commands', () => fileCommands);
vi.mock('@/lib/tauri-api', () => ({ tauriListen: tauriListenMock }));
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
  registeredTauriHandlers.length = 0;
  selectorWindowInstances.length = 0;
  onceRegistrationResults.length = 0;
  askMock.mockResolvedValue(false);
  backupCommands.listBackupsWithMetadata.mockResolvedValue([]);
  backupCommands.readBackupCatalog.mockResolvedValue({});
  backupCommands.normalizeBackupSources.mockImplementation((paths: readonly string[]) =>
    Array.from(new Set(paths)),
  );
  fileCommands.listFiles.mockResolvedValue([]);
  tauriListenMock.mockResolvedValue(vi.fn());
  webviewWindowMock.getByLabel.mockResolvedValue(null);
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
    expect(fileCommands.listFiles).toHaveBeenCalledOnce();
  });

  it('loads backups, catalog, and worlds in order', async () => {
    const calls: string[] = [];
    backupCommands.listBackupsWithMetadata.mockImplementation(async () => {
      calls.push('backups');
      return [];
    });
    backupCommands.readBackupCatalog.mockImplementation(async () => {
      calls.push('catalog');
      return {};
    });
    fileCommands.listFiles.mockImplementation(async () => {
      calls.push('worlds');
      return [];
    });

    renderStrictMode();

    await waitFor(() => expect(calls).toEqual(['backups', 'catalog', 'worlds']));
  });

  it('treats a null catalog as an empty ready catalog', async () => {
    backupCommands.readBackupCatalog.mockResolvedValue(null);
    backupCommands.listBackupsWithMetadata
      .mockResolvedValueOnce([{ name: 'backup.zip', date: new Date(), size: 1 }])
      .mockResolvedValue([]);
    backupCommands.deleteBackup.mockResolvedValue(undefined);
    askMock.mockResolvedValue(true);

    renderStrictMode();
    await waitFor(() => expect(screen.getByTestId('backup-row-backup.zip')).toBeInTheDocument());

    const deleteButton = await waitFor(() => {
      const button = screen.getByRole('button', { name: 'common.delete' });
      expect(button).not.toBeDisabled();
      return button;
    });
    fireEvent.click(deleteButton);

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('backups.toast.deleted'));
    expect(askMock).toHaveBeenCalledOnce();
    expect(askMock).toHaveBeenCalledWith('Delete backup "backup.zip"?', {
      title: 'Delete Backup',
      kind: 'warning',
    });
    expect(backupCommands.deleteBackup).toHaveBeenCalledOnce();
    expect(toastErrorMock).not.toHaveBeenCalledWith('backups.toast.catalogLoadFailed');
  });

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

    await waitFor(() => expect(askMock).toHaveBeenCalledOnce());
    expect(askMock).toHaveBeenCalledWith('Delete backup "backup.zip"?', {
      title: 'Delete Backup',
      kind: 'warning',
    });
    expect(backupCommands.deleteBackup).not.toHaveBeenCalled();
    expect(backupCommands.writeBackupCatalog).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalledWith('backups.toast.deleted');
  });

  it('blocks delete while the catalog is loading and allows it once ready', async () => {
    const catalog = deferred<unknown>();
    backupCommands.listBackupsWithMetadata
      .mockResolvedValueOnce([{ name: 'backup.zip', date: new Date(), size: 1 }])
      .mockResolvedValue([]);
    backupCommands.readBackupCatalog.mockReturnValue(catalog.promise);
    backupCommands.deleteBackup.mockResolvedValue(undefined);
    askMock.mockResolvedValue(true);

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
            mode: 'full',
            parent: null,
            tags: ['new-catalog'],
            note: '',
            sourceCount: 1,
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
            mode: 'full',
            parent: null,
            tags: ['old-catalog'],
            note: '',
            sourceCount: 1,
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
    fileCommands.listFiles.mockResolvedValue([{ name: 'server.properties', isDirectory: false }]);

    render(<BackupsView server={server} />);
    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledOnce());

    await act(async () => {
      useBackupOperationStore.setState({ completionRevisions: { [server.id]: 1 } });
    });

    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByText('server.properties')).toBeInTheDocument());
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
    expect(fileCommands.listFiles).toHaveBeenCalledTimes(2);
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

  it('ignores an old apply listener after an A to B to A server switch', async () => {
    tauriListenMock.mockImplementation((event: string, handler: unknown) => {
      registeredTauriHandlers.push({ event, handler });
      return Promise.resolve(vi.fn());
    });

    const view = renderStrictMode();
    await waitFor(() =>
      expect(
        registeredTauriHandlers.filter(({ event }) => event === 'backup-selector:apply').length,
      ).toBeGreaterThanOrEqual(2),
    );
    const oldApplyHandler = registeredTauriHandlers.filter(
      ({ event }) => event === 'backup-selector:apply',
    )[0].handler as (payload: { paths: string[]; serverPath: string }) => void;
    const initialApplyHandlerCount = registeredTauriHandlers.filter(
      ({ event }) => event === 'backup-selector:apply',
    ).length;

    view.rerender(
      <StrictMode>
        <BackupsView server={{ ...server, id: 'server-b', path: '/managed/server-b' }} />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(
        registeredTauriHandlers.filter(({ event }) => event === 'backup-selector:apply').length,
      ).toBeGreaterThan(initialApplyHandlerCount),
    );
    const bApplyHandlerCount = registeredTauriHandlers.filter(
      ({ event }) => event === 'backup-selector:apply',
    ).length;

    view.rerender(
      <StrictMode>
        <BackupsView server={server} />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(
        registeredTauriHandlers.filter(({ event }) => event === 'backup-selector:apply').length,
      ).toBeGreaterThan(bApplyHandlerCount),
    );

    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByText('backups.modal.noSelection')).toBeInTheDocument());

    await act(async () => {
      oldApplyHandler({ serverPath: server.path, paths: ['old-selection'] });
      await Promise.resolve();
    });

    expect(screen.getByText('backups.modal.noSelection')).toBeInTheDocument();
    expect(screen.queryByText('old-selection')).not.toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalledWith('backups.toast.targetUpdated');
  });

  it('ignores an apply listener retained from a keyed instance after an A to B to A remount', async () => {
    tauriListenMock.mockImplementation((event: string, handler: unknown) => {
      registeredTauriHandlers.push({ event, handler });
      return Promise.resolve(vi.fn());
    });

    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };
    const view = renderKeyedStrictMode('server-a', server);
    await waitFor(() =>
      expect(
        registeredTauriHandlers.filter(({ event }) => event === 'backup-selector:apply').length,
      ).toBeGreaterThanOrEqual(2),
    );
    const oldApplyHandler = registeredTauriHandlers.filter(
      ({ event }) => event === 'backup-selector:apply',
    )[0].handler as (payload: { paths: string[]; serverPath: string }) => void;
    const initialApplyHandlerCount = registeredTauriHandlers.filter(
      ({ event }) => event === 'backup-selector:apply',
    ).length;

    view.rerender(
      <StrictMode>
        <BackupsView key="server-b" server={nextServer} />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(
        registeredTauriHandlers.filter(({ event }) => event === 'backup-selector:apply').length,
      ).toBeGreaterThan(initialApplyHandlerCount),
    );
    const bApplyHandlerCount = registeredTauriHandlers.filter(
      ({ event }) => event === 'backup-selector:apply',
    ).length;

    view.rerender(
      <StrictMode>
        <BackupsView key="server-a" server={server} />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(
        registeredTauriHandlers.filter(({ event }) => event === 'backup-selector:apply').length,
      ).toBeGreaterThan(bApplyHandlerCount),
    );

    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByText('backups.modal.noSelection')).toBeInTheDocument());

    await act(async () => {
      oldApplyHandler({ serverPath: server.path, paths: ['old-selection'] });
      await Promise.resolve();
    });

    expect(screen.getByText('backups.modal.noSelection')).toBeInTheDocument();
    expect(screen.queryByText('old-selection')).not.toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalledWith('backups.toast.targetUpdated');
  });

  it('normalizes selector apply paths before storing them in the create modal', async () => {
    const normalizedSentinel = 'sentinel/normalized';
    backupCommands.normalizeBackupSources.mockReturnValue([normalizedSentinel]);
    tauriListenMock.mockImplementation((event: string, handler: unknown) => {
      registeredTauriHandlers.push({ event, handler });
      return Promise.resolve(vi.fn());
    });

    renderStrictMode();
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByText('backups.modal.noSelection')).toBeInTheDocument());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const applyHandlers = await waitFor(() => {
      const registrations = registeredTauriHandlers.filter(
        ({ event }) => event === 'backup-selector:apply',
      );
      expect(registrations.length).toBeGreaterThanOrEqual(2);
      return registrations.map(
        ({ handler }) => handler as (payload: { paths: string[]; serverPath: string }) => void,
      );
    });

    await act(async () => {
      for (const applyHandler of applyHandlers) {
        applyHandler({
          serverPath: server.path,
          paths: ['world', 'world', 'plugins'],
        });
      }
      await Promise.resolve();
    });

    expect(backupCommands.normalizeBackupSources).toHaveBeenCalledWith([
      'world',
      'world',
      'plugins',
    ]);
    expect(screen.getByText(normalizedSentinel)).toBeInTheDocument();
    expect(screen.queryByText('world')).not.toBeInTheDocument();
    expect(screen.queryByText('plugins')).not.toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith('backups.toast.targetUpdated');
  });

  it('ignores a stale open-create listing after a selector apply', async () => {
    const initialListing = deferred<Array<{ name: string; isDirectory: boolean }>>();
    let rootListingCalls = 0;
    fileCommands.listFiles.mockImplementation((path: string) => {
      if (path === server.path) {
        rootListingCalls += 1;
        return rootListingCalls === 1 ? Promise.resolve([]) : initialListing.promise;
      }
      return Promise.resolve([]);
    });
    tauriListenMock.mockImplementation((event: string, handler: unknown) => {
      registeredTauriHandlers.push({ event, handler });
      return Promise.resolve(vi.fn());
    });

    renderStrictMode();
    await waitFor(() => expect(rootListingCalls).toBe(1));
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByText('backups.modal.noSelection')).toBeInTheDocument());

    await waitFor(() =>
      expect(
        registeredTauriHandlers.filter(({ event }) => event === 'backup-selector:apply').length,
      ).toBeGreaterThanOrEqual(2),
    );
    const applyHandler = registeredTauriHandlers
      .filter(({ event }) => event === 'backup-selector:apply')
      .at(-1)?.handler as (payload: { paths: string[]; serverPath: string }) => void;
    await act(async () => {
      applyHandler({ serverPath: server.path, paths: ['applied-selection'] });
      await Promise.resolve();
      initialListing.resolve([{ name: 'stale-selection', isDirectory: false }]);
      await Promise.resolve();
    });

    expect(screen.getByText('applied-selection')).toBeInTheDocument();
    expect(screen.queryByText('stale-selection')).not.toBeInTheDocument();
  });

  it('ignores a stale open-create listing after clear-all', async () => {
    const initialListing = deferred<Array<{ name: string; isDirectory: boolean }>>();
    let rootListingCalls = 0;
    fileCommands.listFiles.mockImplementation((path: string) => {
      if (path === server.path) {
        rootListingCalls += 1;
        return rootListingCalls === 1 ? Promise.resolve([]) : initialListing.promise;
      }
      return Promise.resolve([]);
    });

    renderStrictMode();
    await waitFor(() => expect(rootListingCalls).toBe(1));
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByText('backups.modal.noSelection')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'backups.modal.clearAll' }));
    await act(async () => {
      initialListing.resolve([{ name: 'stale-selection', isDirectory: false }]);
      await Promise.resolve();
    });

    expect(screen.getByText('backups.modal.noSelection')).toBeInTheDocument();
    expect(screen.queryByText('stale-selection')).not.toBeInTheDocument();
  });

  it('clears old backup and world data before a new server listing fails', async () => {
    const nextServer = { ...server, id: 'server-2', path: '/managed/server-2' };
    const nextServerListing = deferred<never[]>();
    const nextServerWorldListing = deferred<never[]>();
    backupCommands.listBackupsWithMetadata.mockImplementation((serverId: string) => {
      if (serverId === nextServer.id) {
        return nextServerListing.promise;
      }
      return Promise.resolve([{ name: 'old-a.zip', date: new Date(), size: 1 }]);
    });
    fileCommands.listFiles.mockImplementation((path: string) => {
      if (path === server.path) {
        return Promise.resolve([{ name: 'world', isDirectory: true }]);
      }
      if (path === `${server.path}/world`) {
        return Promise.resolve([{ name: 'level.dat', isDirectory: false }]);
      }
      if (path === nextServer.path) {
        return nextServerWorldListing.promise;
      }
      return Promise.resolve([]);
    });

    const view = renderStrictMode();
    await waitFor(() => expect(screen.getByTestId('backup-row-old-a.zip')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('🌍 world')).toBeInTheDocument());

    view.rerender(
      <StrictMode>
        <BackupsView server={nextServer} />
      </StrictMode>,
    );

    expect(screen.queryByTestId('backup-row-old-a.zip')).not.toBeInTheDocument();
    expect(screen.queryByText('🌍 world')).not.toBeInTheDocument();

    await act(async () => {
      nextServerListing.reject(new Error('server B listing failed'));
      nextServerWorldListing.reject(new Error('server B worlds listing failed'));
      for (let index = 0; index < 4; index += 1) {
        await Promise.resolve();
      }
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(2));
  });

  it('ignores stale catalog and world continuations after A to B to A changes', async () => {
    const staleWorldCandidate = deferred<never[]>();
    let worldRootCalls = 0;

    backupCommands.listBackupsWithMetadata
      .mockResolvedValueOnce([{ name: 'old-a.zip', date: new Date(), size: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: 'new-a.zip', date: new Date(), size: 2 }]);
    backupCommands.readBackupCatalog.mockResolvedValue({});
    fileCommands.listFiles.mockImplementation((path: string) => {
      if (path === server.path) {
        worldRootCalls += 1;
        if (worldRootCalls === 1) {
          return Promise.resolve([
            { name: 'old-world', isDirectory: true },
            { name: 'old-broken-world', isDirectory: true },
          ]);
        }
        return Promise.resolve([{ name: 'new-world', isDirectory: true }]);
      }
      if (path === `${server.path}/old-world` || path === `${server.path}/new-world`) {
        return Promise.resolve([{ name: 'level.dat', isDirectory: false }]);
      }
      if (path === `${server.path}/old-broken-world`) {
        return staleWorldCandidate.promise;
      }
      return Promise.resolve([]);
    });
    const view = renderStrictMode();
    await waitFor(() =>
      expect(fileCommands.listFiles).toHaveBeenCalledWith(`${server.path}/old-broken-world`),
    );

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

    await waitFor(() => expect(screen.getByTestId('backup-row-new-a.zip')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('🌍 new-world')).toBeInTheDocument());

    await act(async () => {
      staleWorldCandidate.reject(new Error('stale world candidate failed'));
      for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
      }
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(screen.getByText('🌍 new-world')).toBeInTheDocument();
    expect(screen.queryByText('🌍 old-world')).not.toBeInTheDocument();
    expect(logErrorMock).not.toHaveBeenCalledWith(
      'Failed to inspect world directory candidate',
      expect.anything(),
      expect.anything(),
    );
  });

  it('logs current selector listener registration failures without an unhandled rejection', async () => {
    const applyError = new Error('apply listener registration failed');
    const closeError = new Error('close listener registration failed');
    tauriListenMock.mockImplementation((event: string) => {
      if (event === 'backup-selector:apply') {
        return Promise.reject(applyError);
      }
      if (event === 'backup-selector:close-request') {
        return Promise.reject(closeError);
      }
      return Promise.resolve(vi.fn());
    });

    renderStrictMode();

    await waitFor(() => {
      expect(logErrorMock).toHaveBeenCalledWith(
        'Failed to register backup selector apply listener',
        applyError,
        { serverPath: server.path },
      );
      expect(logErrorMock).toHaveBeenCalledWith(
        'Failed to register backup selector close-request listener',
        closeError,
        { serverPath: server.path },
      );
    });
  });

  it('does not refresh or toast from a stale backup deletion operation', async () => {
    const deletion = deferred<void>();
    backupCommands.listBackupsWithMetadata
      .mockResolvedValueOnce([{ name: 'old-a.zip', date: new Date(), size: 1 }])
      .mockResolvedValue([]);
    backupCommands.deleteBackup.mockReturnValue(deletion.promise);
    askMock.mockResolvedValue(true);

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
    askMock.mockReturnValue(confirmation.promise);

    const view = renderKeyedStrictMode('server-a', server);
    await waitFor(() => expect(screen.getByTestId('backup-row-old-a.zip')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(askMock).toHaveBeenCalledOnce());

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

  it('does not refresh or toast from a stale world deletion operation', async () => {
    const deletion = deferred<void>();
    let worldRootCalls = 0;
    fileCommands.listFiles.mockImplementation((path: string) => {
      if (path === server.path) {
        worldRootCalls += 1;
        return worldRootCalls === 1
          ? Promise.resolve([{ name: 'world', isDirectory: true }])
          : Promise.resolve([]);
      }
      if (path === `${server.path}/world`) {
        return Promise.resolve([{ name: 'level.dat', isDirectory: false }]);
      }
      return Promise.resolve([]);
    });
    fileCommands.deleteItem.mockReturnValue(deletion.promise);
    askMock.mockResolvedValue(true);

    const view = renderStrictMode();
    await waitFor(() => expect(screen.getByText('🌍 world')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'backups.world.deleteButton' }));
    await waitFor(() => expect(fileCommands.deleteItem).toHaveBeenCalledOnce());

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
    await waitFor(() => expect(worldRootCalls).toBe(2));
    const listCallsBeforeStaleCompletion = fileCommands.listFiles.mock.calls.length;

    await act(async () => {
      deletion.resolve();
      for (let index = 0; index < 6; index += 1) {
        await Promise.resolve();
      }
    });

    expect(fileCommands.listFiles).toHaveBeenCalledTimes(listCallsBeforeStaleCompletion);
    expect(toastSuccessMock).not.toHaveBeenCalledWith('backups.world.deleted');
  });
});

describe('BackupsView lifecycle', () => {
  it('continues a manual backup through create IPC after a keyed unmount', async () => {
    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };
    fileCommands.listFiles.mockResolvedValue([{ name: 'world', isDirectory: true }]);
    const createPromise = deferred<void>();
    backupCommands.createBackup.mockReturnValue(createPromise.promise);
    backupCommands.applyBackupRetention.mockResolvedValue({
      deletedNames: [],
      failedDeleteCount: 0,
      listingFailed: false,
    });

    const view = renderKeyedStrictMode('server-a', server);
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByText('world')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('backups-create-submit'));
    await waitFor(() =>
      expect(backupCommands.createBackup).toHaveBeenCalledWith(
        server.id,
        'backup-name.zip',
        5,
      ),
    );

    view.rerender(
      <StrictMode>
        <BackupsView key="server-b" server={nextServer} />
      </StrictMode>,
    );

    await act(async () => {
      createPromise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(backupCommands.createBackup).toHaveBeenCalledWith(
        server.id,
        'backup-name.zip',
        5,
      ),
    );
    expect(backupCommands.applyBackupRetention).toHaveBeenCalledWith(server.id, 0, 0);
    await waitFor(() => expect(backupCommands.writeBackupCatalog).toHaveBeenCalledOnce());
    expect(useBackupOperationStore.getState().activeManualOperations[server.id]).toBeUndefined();
    expect(useBackupOperationStore.getState().completionRevisions[server.id]).toBe(1);
  });

  it('shows a remounted server as creating and reloads after its manual operation completes', async () => {
    fileCommands.listFiles.mockResolvedValue([{ name: 'world', isDirectory: true }]);
    const createPromise = deferred<void>();
    backupCommands.createBackup.mockReturnValue(createPromise.promise);
    backupCommands.applyBackupRetention.mockResolvedValue({
      deletedNames: [],
      failedDeleteCount: 0,
      listingFailed: false,
    });

    const view = renderKeyedStrictMode('server-a', server);
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByText('world')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('backups-create-submit'));
    await waitFor(() =>
      expect(backupCommands.createBackup).toHaveBeenCalledWith(
        server.id,
        'backup-name.zip',
        5,
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
      createPromise.resolve();
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
    fileCommands.listFiles.mockResolvedValue([{ name: 'server.properties', isDirectory: false }]);
    fileCommands.listFilesWithMetadata.mockResolvedValue([
      { name: 'server.properties', isDirectory: false, modified: 10, size: 100 },
    ]);
    backupCommands.createBackup.mockRejectedValue(new Error('create failed'));

    renderStrictMode();
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() => expect(screen.getByText('server.properties')).toBeInTheDocument());
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

  it('ignores a world listing rejection after a keyed instance is unmounted', async () => {
    const oldWorldListing = deferred<never[]>();
    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };
    fileCommands.listFiles.mockImplementation((path: string) => {
      if (path === server.path) {
        return oldWorldListing.promise;
      }
      return Promise.resolve([]);
    });

    const view = renderKeyedStrictMode('server-a', server);
    await waitFor(() => expect(fileCommands.listFiles).toHaveBeenCalledWith(server.path));

    view.rerender(
      <StrictMode>
        <BackupsView key="server-b" server={nextServer} />
      </StrictMode>,
    );
    await waitFor(() => expect(backupCommands.readBackupCatalog).toHaveBeenCalledTimes(2));

    await act(async () => {
      oldWorldListing.reject(new Error('old world listing rejected after unmount'));
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
    askMock.mockResolvedValue(true);

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

  it('does not create a selector for a keyed instance after it is unmounted', async () => {
    const pendingLookup = deferred<null>();
    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };
    webviewWindowMock.getByLabel.mockReturnValue(pendingLookup.promise);

    const view = renderKeyedStrictMode('server-a', server);
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() =>
      expect(screen.getByTestId('backups-open-selector-button')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('backups-open-selector-button'));
    await waitFor(() => expect(webviewWindowMock.getByLabel).toHaveBeenCalledOnce());

    view.rerender(
      <StrictMode>
        <BackupsView key="server-b" server={nextServer} />
      </StrictMode>,
    );

    await act(async () => {
      pendingLookup.resolve(null);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(selectorWindowInstances).toHaveLength(0);
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it('ignores selector callbacks after a keyed instance is unmounted', async () => {
    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };
    webviewWindowMock.getByLabel.mockResolvedValue(null);

    const view = renderKeyedStrictMode('server-a', server);
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() =>
      expect(screen.getByTestId('backups-open-selector-button')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('backups-open-selector-button'));
    await waitFor(() => expect(selectorWindowInstances).toHaveLength(1));

    const selectorWindow = selectorWindowInstances[0];
    const createdCallback = selectorWindow.once.mock.calls.find(
      ([event]) => event === 'tauri://created',
    )?.[1] as (() => void) | undefined;
    const errorCallback = selectorWindow.once.mock.calls.find(
      ([event]) => event === 'tauri://error',
    )?.[1] as ((error: unknown) => void) | undefined;
    expect(selectorWindow.once).toHaveBeenCalledTimes(2);

    view.rerender(
      <StrictMode>
        <BackupsView key="server-b" server={nextServer} />
      </StrictMode>,
    );

    await act(async () => {
      createdCallback?.();
      errorCallback?.(new Error('stale selector creation failed'));
      await Promise.resolve();
    });

    expect(selectorWindow.emit).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it('handles selector once registration rejection and cleans up resolved listeners', async () => {
    const createdRegistrationError = new Error('created listener registration failed');
    const createdRegistration = deferred<() => void>();
    const errorRegistration = deferred<() => void>();
    const errorListenerUnlisten = vi.fn().mockRejectedValue(new Error('unlisten failed'));
    onceRegistrationResults.push(createdRegistration.promise, errorRegistration.promise);
    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };

    const view = renderKeyedStrictMode('server-a', server);
    fireEvent.click(screen.getByTestId('backups-create-button'));
    await waitFor(() =>
      expect(screen.getByTestId('backups-open-selector-button')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('backups-open-selector-button'));

    const selectorWindow = await waitFor(() => {
      expect(selectorWindowInstances).toHaveLength(1);
      return selectorWindowInstances[0];
    });
    await waitFor(() => {
      expect(selectorWindow.once).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      createdRegistration.reject(createdRegistrationError);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(logErrorMock).toHaveBeenCalledWith(
        'Failed to register backup selector created listener',
        createdRegistrationError,
        { serverPath: server.path },
      );
    });

    view.rerender(
      <StrictMode>
        <BackupsView key="server-b" server={nextServer} />
      </StrictMode>,
    );

    await act(async () => {
      errorRegistration.resolve(errorListenerUnlisten);
      await Promise.resolve();
    });

    expect(errorListenerUnlisten).toHaveBeenCalledOnce();
  });

  it('suppresses a close-request error after the listener instance is unmounted', async () => {
    const pendingLookup = deferred<null>();
    const nextServer = { ...server, id: 'server-b', path: '/managed/server-b' };
    let closeRequestHandler: ((payload: { serverPath: string }) => Promise<void>) | undefined;
    tauriListenMock.mockImplementation((event: string, handler: unknown) => {
      if (event === 'backup-selector:close-request') {
        closeRequestHandler = handler as (payload: { serverPath: string }) => Promise<void>;
      }
      return Promise.resolve(vi.fn());
    });
    webviewWindowMock.getByLabel.mockReturnValue(pendingLookup.promise);

    const view = renderKeyedStrictMode('server-a', server);
    await waitFor(() => expect(closeRequestHandler).toBeDefined());
    const closePromise = closeRequestHandler?.({ serverPath: server.path });

    view.rerender(
      <StrictMode>
        <BackupsView key="server-b" server={nextServer} />
      </StrictMode>,
    );

    await act(async () => {
      pendingLookup.reject(new Error('stale close lookup failed'));
      await closePromise;
    });

    expect(logErrorMock).not.toHaveBeenCalled();
  });
});
