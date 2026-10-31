import WorldManager from '@/renderer/components/properties/WorldManager';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fileCommands,
  logErrorMock,
  toastErrorMock,
  toastSuccessMock,
  toastWarningMock,
  translator,
} = vi.hoisted(() => {
  return {
    fileCommands: {
      deleteItem: vi.fn(),
      getManagedDirectorySize: vi.fn(),
      listFiles: vi.fn(),
    },
    logErrorMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastWarningMock: vi.fn(),
    // One stable object, so effects that read `t` do not re-run on every render.
    translator: {
      locale: 'en',
      setLocale: vi.fn(),
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}(${JSON.stringify(params)})` : key,
    },
  };
});

vi.mock('@/i18n', () => ({
  useTranslation: () => translator,
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

vi.mock('@/lib/file-commands', () => fileCommands);
vi.mock('@/lib/error-utils', () => ({ logError: logErrorMock }));
vi.mock('@/renderer/shared/notify', () => ({
  notify: {
    error: toastErrorMock,
    success: toastSuccessMock,
    warning: toastWarningMock,
    info: vi.fn(),
  },
}));

const server = {
  id: 'server-1',
  name: 'Paper Server',
  path: '/managed/server-1',
  software: 'Paper',
  version: '1.21.4',
  status: 'offline',
  port: 25565,
  memory: 2048,
  javaPath: 'java',
} as MinecraftServer;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

/** Lists the server root as `rootEntries`, and every world folder as one that holds a level.dat. */
function listWorldFolders(rootEntries: Array<{ name: string; isDirectory: boolean }>) {
  return async (path: string) =>
    path === server.path ? rootEntries : [{ name: 'level.dat', isDirectory: false }];
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  fileCommands.listFiles.mockResolvedValue([]);
  fileCommands.deleteItem.mockResolvedValue(undefined);
  fileCommands.getManagedDirectorySize.mockResolvedValue({ bytes: 0, complete: true });
});

describe('WorldManager listing', () => {
  it('lists folders named like a world or holding a level.dat, skips backups, and sorts by name', async () => {
    fileCommands.listFiles.mockImplementation(async (path: string) => {
      if (path === server.path) {
        return [
          { name: 'world_nether', isDirectory: true },
          { name: 'backups', isDirectory: true },
          { name: 'mystuff', isDirectory: true },
          { name: 'plain', isDirectory: true },
          { name: 'world', isDirectory: true },
          { name: 'server.properties', isDirectory: false },
        ];
      }
      if (path === `${server.path}/mystuff`) {
        return [{ name: 'level.dat', isDirectory: false }];
      }
      if (path === `${server.path}/plain`) {
        return [{ name: 'readme.txt', isDirectory: false }];
      }
      return [];
    });

    render(<WorldManager server={server} />);

    await waitFor(() => expect(screen.getAllByTestId(/^world-size-/)).toHaveLength(3));
    expect(
      screen.getAllByTestId(/^world-size-/).map((element) => element.getAttribute('data-testid')),
    ).toEqual(['world-size-mystuff', 'world-size-world', 'world-size-world_nether']);
    expect(fileCommands.listFiles).not.toHaveBeenCalledWith(`${server.path}/backups`);
  });

  it('shows the empty line when the server has no world folders', async () => {
    render(<WorldManager server={server} />);

    expect(await screen.findByText('backups.world.empty')).toBeInTheDocument();
  });

  it('shows each world size as it is measured, and a lower bound when the scan ran out of time', async () => {
    fileCommands.listFiles.mockImplementation(
      listWorldFolders([
        { name: 'world', isDirectory: true },
        { name: 'world_nether', isDirectory: true },
      ]),
    );
    fileCommands.getManagedDirectorySize.mockImplementation(async (path: string) =>
      path.endsWith('/world') ? { bytes: 2048, complete: true } : { bytes: 4096, complete: false },
    );

    render(<WorldManager server={server} />);

    await waitFor(() => expect(screen.getByTestId('world-size-world')).toHaveTextContent('2 KB'));
    expect(screen.getByTestId('world-size-world_nether')).toHaveTextContent('backups.size.atLeast');
  });

  it('shows a dash when a world folder cannot be measured', async () => {
    fileCommands.listFiles.mockImplementation(
      listWorldFolders([{ name: 'world', isDirectory: true }]),
    );
    fileCommands.getManagedDirectorySize.mockRejectedValue(new Error('denied'));

    render(<WorldManager server={server} />);

    await waitFor(() => expect(screen.getByTestId('world-size-world')).toHaveTextContent('—'));
    expect(logErrorMock).toHaveBeenCalledWith('Failed to measure folder size', expect.any(Error), {
      path: `${server.path}/world`,
    });
  });

  it('shows a load failure toast and an empty list when the server folder cannot be listed', async () => {
    fileCommands.listFiles.mockRejectedValue(new Error('denied'));

    render(<WorldManager server={server} />);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('backups.toast.worldLoadFailed'),
    );
    expect(screen.getByText('backups.world.empty')).toBeInTheDocument();
  });

  it('ignores a world candidate that fails after the server changed and changed back (A to B to A)', async () => {
    const staleWorldCandidate = deferred<never[]>();
    let rootCalls = 0;
    fileCommands.listFiles.mockImplementation(async (path: string) => {
      if (path === server.path) {
        rootCalls += 1;
        return rootCalls === 1
          ? [
              { name: 'old-world', isDirectory: true },
              { name: 'old-broken-world', isDirectory: true },
            ]
          : [{ name: 'new-world', isDirectory: true }];
      }
      if (path === `${server.path}/old-broken-world`) {
        return staleWorldCandidate.promise;
      }
      return [{ name: 'level.dat', isDirectory: false }];
    });

    const view = render(<WorldManager server={server} />);
    await waitFor(() =>
      expect(fileCommands.listFiles).toHaveBeenCalledWith(`${server.path}/old-broken-world`),
    );

    view.rerender(
      <WorldManager server={{ ...server, id: 'server-b', path: '/managed/server-b' }} />,
    );
    view.rerender(<WorldManager server={server} />);

    await waitFor(() => expect(screen.getByTestId('world-size-new-world')).toBeInTheDocument());

    await act(async () => {
      staleWorldCandidate.reject(new Error('stale world candidate failed'));
      for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
      }
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('world-size-old-world')).not.toBeInTheDocument();
    expect(logErrorMock).not.toHaveBeenCalledWith(
      'Failed to inspect world directory candidate',
      expect.anything(),
      expect.anything(),
    );
  });

  it('ignores a world listing rejection after the view unmounts', async () => {
    const oldListing = deferred<never[]>();
    fileCommands.listFiles.mockImplementation((path: string) =>
      path === server.path ? oldListing.promise : Promise.resolve([]),
    );

    const view = render(<WorldManager server={server} />);
    await waitFor(() => expect(fileCommands.listFiles).toHaveBeenCalledWith(server.path));

    view.unmount();
    await act(async () => {
      oldListing.reject(new Error('old world listing rejected after unmount'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });
});

describe('WorldManager delete', () => {
  it('blocks delete and explains why while the server is not offline', async () => {
    fileCommands.listFiles.mockImplementation(
      listWorldFolders([{ name: 'world', isDirectory: true }]),
    );

    const { container } = render(
      <WorldManager server={{ ...server, status: 'online' } as MinecraftServer} />,
    );

    const hold = await screen.findByRole('button', { name: 'backups.world.holdToDelete' });
    expect(hold).toBeDisabled();
    fireEvent.click(hold);
    expect(fileCommands.deleteItem).not.toHaveBeenCalled();

    const reasonTrigger = container.querySelector('[data-blocked]') as HTMLElement;
    fireEvent.pointerMove(reasonTrigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('backups.world.stopServerFirst');
  });

  it('deletes a world after its hold completes, then reloads the list', async () => {
    let worldsOnDisk = [{ name: 'world', isDirectory: true }];
    fileCommands.listFiles.mockImplementation(async (path: string) =>
      path === server.path ? worldsOnDisk : [{ name: 'level.dat', isDirectory: false }],
    );
    fileCommands.deleteItem.mockImplementation(async () => {
      worldsOnDisk = [];
    });

    render(<WorldManager server={server} />);
    fireEvent.click(await screen.findByRole('button', { name: 'backups.world.holdToDelete' }));

    await waitFor(() => expect(screen.getByText('backups.world.empty')).toBeInTheDocument());
    expect(fileCommands.deleteItem).toHaveBeenCalledWith(`${server.path}/world`);
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringContaining('backups.world.deleted'));
  });

  it('does not reload or toast from a deletion that started before the server changed (A to B to A)', async () => {
    const deletion = deferred<void>();
    let rootCalls = 0;
    fileCommands.listFiles.mockImplementation(async (path: string) => {
      if (path === server.path) {
        rootCalls += 1;
        return rootCalls === 1 ? [{ name: 'world', isDirectory: true }] : [];
      }
      return [{ name: 'level.dat', isDirectory: false }];
    });
    fileCommands.deleteItem.mockReturnValue(deletion.promise);

    const view = render(<WorldManager server={server} />);
    fireEvent.click(await screen.findByRole('button', { name: 'backups.world.holdToDelete' }));
    await waitFor(() => expect(fileCommands.deleteItem).toHaveBeenCalledOnce());

    view.rerender(
      <WorldManager server={{ ...server, id: 'server-b', path: '/managed/server-b' }} />,
    );
    view.rerender(<WorldManager server={server} />);
    await waitFor(() => expect(rootCalls).toBe(2));
    const listCallsBeforeStaleCompletion = fileCommands.listFiles.mock.calls.length;

    await act(async () => {
      deletion.resolve();
      for (let index = 0; index < 6; index += 1) {
        await Promise.resolve();
      }
    });

    expect(fileCommands.listFiles).toHaveBeenCalledTimes(listCallsBeforeStaleCompletion);
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
