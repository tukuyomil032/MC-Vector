import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useI18nStore } from '@/i18n';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import PropertiesView from '@/renderer/components/properties/PropertiesView';
import { hasUnsavedViewChanges } from '@/renderer/components/properties/use-unsaved-changes-guard';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerPropertiesMock, saveServerPropertiesMock, toastMock, logErrorMock } = vi.hoisted(
  () => ({
    getServerPropertiesMock: vi.fn(),
    saveServerPropertiesMock: vi.fn(),
    toastMock: {
      error: vi.fn(),
      success: vi.fn(),
    },
    logErrorMock: vi.fn(),
  }),
);

vi.mock('@/lib/properties-commands', () => ({
  getServerProperties: getServerPropertiesMock,
  saveServerProperties: saveServerPropertiesMock,
}));
vi.mock('@/lib/error-utils', () => ({ logError: logErrorMock }));
vi.mock('@/renderer/shared/notify', () => ({
  notify: { error: toastMock.error, success: toastMock.success, info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/renderer/components/properties/AdvancedSettingsWindow', () => ({
  default: () => null,
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const serverA = {
  id: 'server-a',
  name: 'Server A',
  version: '1.21',
  software: 'Paper',
  port: 25565,
  memory: 2048,
  path: '/servers/server-a',
  status: 'offline',
} as MinecraftServer;

const serverB = { ...serverA, id: 'server-b', name: 'Server B', port: 25566 };

function motdInput(): HTMLInputElement {
  return screen.getByLabelText('MOTD') as HTMLInputElement;
}

beforeEach(() => {
  useI18nStore.setState({ currentLocale: 'en' });
  getServerPropertiesMock.mockReset();
  saveServerPropertiesMock.mockReset();
  toastMock.error.mockReset();
  toastMock.success.mockReset();
  logErrorMock.mockReset();
});

describe('PropertiesView async server switching', () => {
  it('ignores an older load failure and keeps the current server loading until its response arrives', async () => {
    const firstLoad = deferred<Record<string, string | number | boolean>>();
    const secondLoad = deferred<Record<string, string | number | boolean>>();
    getServerPropertiesMock.mockImplementation((serverId: string) =>
      serverId === serverA.id ? firstLoad.promise : secondLoad.promise,
    );
    const { rerender } = render(<PropertiesView server={serverA} />);
    rerender(<PropertiesView server={serverB} />);

    await waitFor(() => expect(getServerPropertiesMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      firstLoad.reject(new Error('stale server load failed'));
      await firstLoad.promise.catch(() => undefined);
    });

    expect(screen.queryByTestId('properties-loading')).not.toBeNull();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();

    await act(async () => {
      secondLoad.resolve({ motd: 'Current server', 'server-port': 25566 });
      await secondLoad.promise;
    });

    await waitFor(() => expect(motdInput()).toHaveValue('Current server'));
  });

  it('does not let a late older success overwrite the currently displayed server', async () => {
    const firstLoad = deferred<Record<string, string | number | boolean>>();
    const secondLoad = deferred<Record<string, string | number | boolean>>();
    getServerPropertiesMock.mockImplementation((serverId: string) =>
      serverId === serverA.id ? firstLoad.promise : secondLoad.promise,
    );
    const { rerender } = render(<PropertiesView server={serverA} />);
    rerender(<PropertiesView server={serverB} />);

    await waitFor(() => expect(getServerPropertiesMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      secondLoad.resolve({ motd: 'Server B value', 'server-port': 25566 });
      await secondLoad.promise;
    });
    await waitFor(() => expect(motdInput()).toHaveValue('Server B value'));

    await act(async () => {
      firstLoad.resolve({ motd: 'Server A stale value', 'server-port': 25565 });
      await firstLoad.promise;
    });

    expect(motdInput()).toHaveValue('Server B value');
  });

  it('notifies the parent for a saved old server but does not toast after switching views', async () => {
    const saveResult = deferred<number | null>();
    getServerPropertiesMock
      .mockResolvedValueOnce({ motd: 'Server A value', 'server-port': 25565 })
      .mockResolvedValueOnce({ motd: 'Server B value', 'server-port': 25566 });
    saveServerPropertiesMock.mockReturnValue(saveResult.promise);
    const onServerPortChanged = vi.fn();
    const { rerender } = render(
      <PropertiesView server={serverA} onServerPortChanged={onServerPortChanged} />,
    );
    await waitFor(() => expect(motdInput()).toHaveValue('Server A value'));

    fireEvent.change(motdInput(), { target: { value: 'Saved A value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(saveServerPropertiesMock).toHaveBeenCalledOnce());
    rerender(<PropertiesView server={serverB} onServerPortChanged={onServerPortChanged} />);
    await waitFor(() => expect(motdInput()).toHaveValue('Server B value'));

    await act(async () => {
      saveResult.resolve(25600);
      await saveResult.promise;
    });

    expect(onServerPortChanged).toHaveBeenCalledWith(serverA.id, 25600);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(motdInput()).toHaveValue('Server B value');
  });
});

describe('PropertiesView search', () => {
  it('shows an empty state when no property matches the search', async () => {
    getServerPropertiesMock.mockResolvedValue({ motd: 'Hello', 'server-port': 25565 });
    render(<PropertiesView server={serverA} />);
    await waitFor(() => expect(motdInput()).toHaveValue('Hello'));

    fireEvent.change(screen.getByLabelText('Search properties'), {
      target: { value: 'no-such-property' },
    });

    expect(screen.getByText('No matching properties')).toBeInTheDocument();
    expect(screen.queryByLabelText('MOTD')).not.toBeInTheDocument();
  });
});

describe('PropertiesView unsaved changes', () => {
  it('enables save only after an edit and reports the view as unsaved until it unmounts', async () => {
    getServerPropertiesMock.mockResolvedValue({ motd: 'Hello', 'server-port': 25565 });
    const { unmount } = render(<PropertiesView server={serverA} />);
    await waitFor(() => expect(motdInput()).toHaveValue('Hello'));
    const save = screen.getByRole('button', { name: 'Save Changes' });
    expect(save).toBeDisabled();
    expect(hasUnsavedViewChanges()).toBe(false);

    fireEvent.change(motdInput(), { target: { value: 'Edited' } });

    expect(save).toBeEnabled();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(hasUnsavedViewChanges()).toBe(true);
    unmount();
    expect(hasUnsavedViewChanges()).toBe(false);
  });
});

describe('PropertiesView load failure', () => {
  it('hides the form and blocks saving defaults after a failed read, then retries the load', async () => {
    getServerPropertiesMock
      .mockRejectedValueOnce(new Error('disk read failed'))
      .mockResolvedValueOnce({ motd: 'Real value', 'server-port': 25565 });
    render(<PropertiesView server={serverA} />);

    expect(await screen.findByText('Failed to load server properties')).toBeInTheDocument();
    expect(screen.queryByLabelText('MOTD')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    expect(saveServerPropertiesMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(motdInput()).toHaveValue('Real value'));
    expect(getServerPropertiesMock).toHaveBeenCalledTimes(2);
    expect(saveServerPropertiesMock).not.toHaveBeenCalled();
  });
});
