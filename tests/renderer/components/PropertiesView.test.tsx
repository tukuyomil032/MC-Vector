import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useI18nStore } from '@/i18n';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import PropertiesView from '@/renderer/components/properties/PropertiesView';
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

function motdInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('.properties-view__motd-input');
  if (!input) throw new Error('MOTD input is missing');
  return input;
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
    const { container, rerender } = render(<PropertiesView server={serverA} />);
    rerender(<PropertiesView server={serverB} />);

    await waitFor(() => expect(getServerPropertiesMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      firstLoad.reject(new Error('stale server load failed'));
      await firstLoad.promise.catch(() => undefined);
    });

    expect(container.querySelector('.properties-view__loading')).not.toBeNull();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();

    await act(async () => {
      secondLoad.resolve({ motd: 'Current server', 'server-port': 25566 });
      await secondLoad.promise;
    });

    await waitFor(() => expect(motdInput(container)).toHaveValue('Current server'));
  });

  it('does not let a late older success overwrite the currently displayed server', async () => {
    const firstLoad = deferred<Record<string, string | number | boolean>>();
    const secondLoad = deferred<Record<string, string | number | boolean>>();
    getServerPropertiesMock.mockImplementation((serverId: string) =>
      serverId === serverA.id ? firstLoad.promise : secondLoad.promise,
    );
    const { container, rerender } = render(<PropertiesView server={serverA} />);
    rerender(<PropertiesView server={serverB} />);

    await waitFor(() => expect(getServerPropertiesMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      secondLoad.resolve({ motd: 'Server B value', 'server-port': 25566 });
      await secondLoad.promise;
    });
    await waitFor(() => expect(motdInput(container)).toHaveValue('Server B value'));

    await act(async () => {
      firstLoad.resolve({ motd: 'Server A stale value', 'server-port': 25565 });
      await firstLoad.promise;
    });

    expect(motdInput(container)).toHaveValue('Server B value');
  });

  it('notifies the parent for a saved old server but does not toast after switching views', async () => {
    const saveResult = deferred<number | null>();
    getServerPropertiesMock
      .mockResolvedValueOnce({ motd: 'Server A value', 'server-port': 25565 })
      .mockResolvedValueOnce({ motd: 'Server B value', 'server-port': 25566 });
    saveServerPropertiesMock.mockReturnValue(saveResult.promise);
    const onServerPortChanged = vi.fn();
    const { container, rerender } = render(
      <PropertiesView server={serverA} onServerPortChanged={onServerPortChanged} />,
    );
    await waitFor(() => expect(motdInput(container)).toHaveValue('Server A value'));

    fireEvent.change(motdInput(container), { target: { value: 'Saved A value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(saveServerPropertiesMock).toHaveBeenCalledOnce());
    rerender(<PropertiesView server={serverB} onServerPortChanged={onServerPortChanged} />);
    await waitFor(() => expect(motdInput(container)).toHaveValue('Server B value'));

    await act(async () => {
      saveResult.resolve(25600);
      await saveResult.promise;
    });

    expect(onServerPortChanged).toHaveBeenCalledWith(serverA.id, 25600);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(motdInput(container)).toHaveValue('Server B value');
  });
});
