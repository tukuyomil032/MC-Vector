import BackupTargetSelectorWindow from '@/renderer/components/BackupTargetSelectorWindow';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SelectorLoadPayload = { serverPath: string; selected: string[] };

const {
  emitMock,
  getCurrentWindowMock,
  listFilesWithMetadataMock,
  normalizeBackupSourcesMock,
  registeredTauriHandlers,
  tauriListenMock,
} = vi.hoisted(() => ({
  emitMock: vi.fn().mockResolvedValue(undefined),
  getCurrentWindowMock: vi.fn(() => ({ close: vi.fn().mockResolvedValue(undefined) })),
  listFilesWithMetadataMock: vi.fn(),
  normalizeBackupSourcesMock: vi.fn(),
  registeredTauriHandlers: [] as Array<{
    event: string;
    handler: (payload: SelectorLoadPayload) => void;
  }>,
  tauriListenMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({ emit: emitMock }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: getCurrentWindowMock }));
vi.mock('@/lib/backup-commands', () => ({
  normalizeBackupSources: normalizeBackupSourcesMock,
}));
vi.mock('@/lib/error-utils', () => ({ logError: vi.fn() }));
vi.mock('@/lib/file-commands', () => ({
  listFilesWithMetadata: listFilesWithMetadataMock,
}));
vi.mock('@/lib/tauri-api', () => ({ tauriListen: tauriListenMock }));
vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    locale: 'en',
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

const serverPath = '/managed/server-1';

const treeEntries: Record<
  string,
  Array<{ name: string; isDirectory: boolean; size: number; modified: number }>
> = {
  [serverPath]: [
    { name: 'backups', isDirectory: true, size: 0, modified: 1 },
    { name: 'plugins', isDirectory: true, size: 0, modified: 1 },
    { name: 'server.properties', isDirectory: false, size: 10, modified: 1 },
    { name: 'world', isDirectory: true, size: 0, modified: 1 },
  ],
  [`${serverPath}/plugins`]: [
    { name: 'essentials.jar', isDirectory: false, size: 20, modified: 1 },
  ],
  [`${serverPath}/world`]: [
    { name: 'level.dat', isDirectory: false, size: 30, modified: 1 },
    { name: 'region', isDirectory: true, size: 0, modified: 1 },
  ],
  [`${serverPath}/world/region`]: [
    { name: 'r.0.0.mca', isDirectory: false, size: 40, modified: 1 },
  ],
};

function normalize(paths: readonly string[]): string[] {
  const unique = Array.from(
    new Set(
      paths.map((path) =>
        path
          .replace(/\\/g, '/')
          .replace(/\/{2,}/g, '/')
          .replace(/^\/+|\/+$/g, ''),
      ),
    ),
  );
  return unique
    .sort((left, right) => {
      const depthDifference = left.split('/').length - right.split('/').length;
      return depthDifference || left.localeCompare(right);
    })
    .filter(
      (path, index, sorted) =>
        !sorted.slice(0, index).some((ancestor) => path.startsWith(`${ancestor}/`)),
    )
    .sort((left, right) => left.localeCompare(right));
}

function setSelectorUrl(selected: string[] = []) {
  const params = new URLSearchParams({
    backupSelector: '1',
    serverPath,
    selected: JSON.stringify(selected),
  });
  window.history.replaceState({}, '', `/?${params.toString()}`);
}

function renderSelector(selected: string[] = []) {
  setSelectorUrl(selected);
  return render(<BackupTargetSelectorWindow />);
}

function createDeferred<T>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function checkbox(path: string): HTMLInputElement {
  return screen.getByRole('checkbox', {
    name: `${path.split('/').at(-1)} (${path})`,
  }) as HTMLInputElement;
}

function expandDirectory(path: string) {
  const directoryName = path.split('/').at(-1);
  fireEvent.click(
    screen.getByRole('button', {
      name: 'backupSelector.ariaExpandDirectory',
    }),
  );
  expect(checkbox(path)).toBeInTheDocument();
  expect(directoryName).toBeTruthy();
}

beforeEach(() => {
  vi.clearAllMocks();
  registeredTauriHandlers.length = 0;
  setSelectorUrl();
  normalizeBackupSourcesMock.mockImplementation(normalize);
  listFilesWithMetadataMock.mockImplementation((path: string) =>
    Promise.resolve(treeEntries[path] ?? []),
  );
  tauriListenMock.mockResolvedValue(vi.fn());
});

describe('BackupTargetSelectorWindow hierarchy selection', () => {
  it('inherits a selected parent state to all descendants', async () => {
    renderSelector(['world']);

    await waitFor(() => expect(checkbox('world/level.dat')).toBeChecked());
    expandDirectory('world/region');

    expect(checkbox('world')).toBeChecked();
    expect(checkbox('world/region')).toBeChecked();
    expect(checkbox('world/region/r.0.0.mca')).toBeChecked();
  });

  it('marks a parent indeterminate when only part of its descendants is selected', async () => {
    renderSelector(['world/region']);

    await waitFor(() => expect(checkbox('world/region')).toBeChecked());

    const worldCheckbox = checkbox('world');
    expect(worldCheckbox).not.toBeChecked();
    expect(worldCheckbox.indeterminate).toBe(true);
    expect(worldCheckbox).toHaveAttribute('aria-checked', 'mixed');
    expect(checkbox('world/level.dat')).not.toBeChecked();
  });

  it('expands a selected parent when a child is unchecked', async () => {
    renderSelector(['world']);

    const levelDatCheckbox = await waitFor(() => checkbox('world/level.dat'));
    expect(levelDatCheckbox).toBeChecked();
    fireEvent.click(levelDatCheckbox);

    await waitFor(() => expect(checkbox('world')).not.toBeChecked());
    expect(checkbox('world')).toHaveProperty('indeterminate', true);
    expect(checkbox('world/region')).toBeChecked();
    expect(levelDatCheckbox).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'backupSelector.apply' }));
    await waitFor(() =>
      expect(emitMock).toHaveBeenCalledWith('backup-selector:apply', {
        serverPath,
        paths: ['world/region'],
      }),
    );
  });

  it('clears a parent and every descendant when the parent is unchecked', async () => {
    renderSelector(['world']);

    const worldCheckbox = await waitFor(() => checkbox('world'));
    expect(worldCheckbox).toBeChecked();
    expandDirectory('world/region');
    fireEvent.click(worldCheckbox);

    await waitFor(() => expect(worldCheckbox).not.toBeChecked());
    expect(checkbox('world/region')).not.toBeChecked();
    expect(checkbox('world/region/r.0.0.mca')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'backupSelector.apply' })).toBeDisabled();
  });

  it('selects only top-level roots while descendants display checked through inheritance', async () => {
    renderSelector();

    const selectAll = await waitFor(() =>
      screen.getByRole('button', { name: 'backupSelector.selectAll' }),
    );
    fireEvent.click(selectAll);

    await waitFor(() => expect(checkbox('world/region')).toBeChecked());
    expandDirectory('world/region');
    expect(checkbox('world/region/r.0.0.mca')).toBeChecked();
    expect(checkbox('plugins')).toBeChecked();
    expect(checkbox('plugins/essentials.jar')).toBeChecked();
    expect(checkbox('server.properties')).toBeChecked();
    expect(checkbox('world')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'backupSelector.apply' }));
    await waitFor(() =>
      expect(emitMock).toHaveBeenCalledWith('backup-selector:apply', {
        serverPath,
        paths: ['plugins', 'server.properties', 'world'],
      }),
    );
  });

  it('normalizes the selector apply payload before emitting it', async () => {
    renderSelector(['world', 'world/level.dat', 'world/region', 'world/region/r.0.0.mca']);

    await waitFor(() => expect(checkbox('world/level.dat')).toBeChecked());
    fireEvent.click(screen.getByRole('button', { name: 'backupSelector.apply' }));

    await waitFor(() => expect(normalizeBackupSourcesMock).toHaveBeenCalled());
    expect(emitMock).toHaveBeenCalledWith('backup-selector:apply', {
      serverPath,
      paths: ['world'],
    });
  });

  it('normalizes backslash and trailing separators before expanding the initial selection', async () => {
    renderSelector(['world\\region\\']);

    await waitFor(() => expect(checkbox('world/region/r.0.0.mca')).toBeInTheDocument());

    expect(checkbox('world/region')).toBeChecked();
  });

  it('does not let an older deferred load overwrite a newer selector load', async () => {
    const oldRoot = createDeferred<(typeof treeEntries)[typeof serverPath]>();
    const newRoot = createDeferred<(typeof treeEntries)[typeof serverPath]>();
    const newServerPath = '/managed/server-2';

    tauriListenMock.mockImplementation(
      (event: string, handler: (payload: SelectorLoadPayload) => void) => {
        registeredTauriHandlers.push({ event, handler });
        return Promise.resolve(vi.fn());
      },
    );
    listFilesWithMetadataMock.mockImplementation((path: string) => {
      if (path === serverPath) {
        return oldRoot.promise;
      }
      if (path === newServerPath) {
        return newRoot.promise;
      }
      if (path === `${newServerPath}/new-dir`) {
        return Promise.resolve([
          { name: 'new-child.txt', isDirectory: false, size: 1, modified: 1 },
        ]);
      }
      return Promise.resolve([]);
    });

    renderSelector();

    const loadHandler = await waitFor(() => {
      const handlers = registeredTauriHandlers.filter(
        ({ event }) => event === 'backup-selector:load',
      );
      expect(handlers.length).toBeGreaterThanOrEqual(1);
      return handlers.at(-1)?.handler;
    });

    await act(async () => {
      loadHandler?.({ serverPath: newServerPath, selected: ['new-dir'] });
      await Promise.resolve();
    });

    await waitFor(() => expect(listFilesWithMetadataMock).toHaveBeenCalledWith(newServerPath));

    await act(async () => {
      newRoot.resolve([{ name: 'new-dir', isDirectory: true, size: 0, modified: 1 }]);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(checkbox('new-dir/new-child.txt')).toBeChecked());

    await act(async () => {
      oldRoot.resolve([{ name: 'old.txt', isDirectory: false, size: 1, modified: 1 }]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(checkbox('new-dir/new-child.txt')).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'old.txt (old.txt)' })).not.toBeInTheDocument();
    expect(screen.queryByText('backupSelector.loading')).not.toBeInTheDocument();
  });
});
