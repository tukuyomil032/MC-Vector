import type { Translate } from '@/i18n';
import { useServerAutomation } from '@/renderer/hooks/use-server-automation';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cancelAutoRestartMock,
  onServerAutomationEventMock,
  resumeAutoRestartAfterEulaMock,
  sendServerNotificationMock,
} = vi.hoisted(() => ({
  cancelAutoRestartMock: vi.fn(),
  onServerAutomationEventMock: vi.fn(),
  resumeAutoRestartAfterEulaMock: vi.fn(),
  sendServerNotificationMock: vi.fn(),
}));

vi.mock('@/lib/server-automation-commands', () => ({
  cancelAutoRestart: cancelAutoRestartMock,
  onServerAutomationEvent: onServerAutomationEventMock,
  resumeAutoRestartAfterEula: resumeAutoRestartAfterEulaMock,
}));

vi.mock('@/lib/notification-commands', () => ({
  sendServerNotification: sendServerNotificationMock,
}));

const server: MinecraftServer = {
  id: 'server-1',
  name: 'Test Server',
  version: '1.21.10',
  software: 'Paper',
  port: 25565,
  memory: 2048,
  path: '/mock/app-data/servers/server-1',
  status: 'offline',
  createdDate: '2026-01-01T00:00:00.000Z',
};

const translate = ((key: string) => key) as Translate;

describe('use-server-automation Rust event bridge', () => {
  let eventHandler: ((event: Record<string, unknown>) => void) | null;
  let unlistenMock: ReturnType<typeof vi.fn>;
  let currentServers: MinecraftServer[];
  let setServersMock: ReturnType<typeof vi.fn>;
  let showToastMock: ReturnType<typeof vi.fn>;
  let ensureServerEulaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventHandler = null;
    unlistenMock = vi.fn();
    currentServers = [server];
    setServersMock = vi.fn((update: unknown) => {
      currentServers =
        typeof update === 'function'
          ? (update as (servers: MinecraftServer[]) => MinecraftServer[])(currentServers)
          : (update as MinecraftServer[]);
    });
    showToastMock = vi.fn();
    ensureServerEulaMock = vi.fn().mockResolvedValue('accepted');
    cancelAutoRestartMock.mockReset().mockResolvedValue(undefined);
    resumeAutoRestartAfterEulaMock.mockReset().mockResolvedValue(undefined);
    sendServerNotificationMock.mockReset().mockResolvedValue(undefined);
    onServerAutomationEventMock.mockReset().mockImplementation(async (callback) => {
      eventHandler = callback;
      return unlistenMock;
    });
  });

  const mount = () =>
    renderHook(() =>
      useServerAutomation({
        servers: currentServers,
        setServers: setServersMock as (
          next: MinecraftServer[] | ((prev: MinecraftServer[]) => MinecraftServer[]),
        ) => void,
        showToast: showToastMock as (
          message: string,
          type?: 'info' | 'success' | 'warning' | 'error',
        ) => void,
        t: translate,
        ensureServerEula: ensureServerEulaMock as (
          server: MinecraftServer,
          mode: 'interactive' | 'background',
        ) => Promise<'accepted' | 'cancelled' | 'blocked'>,
      }),
    );

  it('renders a Rust scheduled restart as restarting and shows the translated event', async () => {
    mount();
    await waitFor(() => expect(eventHandler).toBeTypeOf('function'));

    act(() => {
      eventHandler?.({
        kind: 'auto_restart_scheduled',
        serverId: server.id,
        serverName: server.name,
        seconds: 5,
        attempt: 1,
        max: 3,
      });
    });

    expect(currentServers[0].status).toBe('restarting');
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining('server.toast.autoRestartScheduled'),
      'info',
    );
  });

  it('requires interactive EULA acceptance before asking Rust to resume a pending restart', async () => {
    const { unmount } = mount();
    await waitFor(() => expect(eventHandler).toBeTypeOf('function'));

    await act(async () => {
      eventHandler?.({
        kind: 'auto_restart_eula_required',
        serverId: server.id,
        serverName: server.name,
        attempt: 1,
        max: 3,
      });
    });

    expect(ensureServerEulaMock).toHaveBeenCalledWith(server, 'interactive');
    expect(resumeAutoRestartAfterEulaMock).toHaveBeenCalledWith(server.id);
    unmount();
    expect(unlistenMock).toHaveBeenCalledTimes(1);
  });

  it('shows backup success and a warning when Rust could not update the backup registry', async () => {
    mount();
    await waitFor(() => expect(eventHandler).toBeTypeOf('function'));

    act(() => {
      eventHandler?.({
        kind: 'auto_backup_created',
        serverId: server.id,
        serverName: server.name,
        catalogError: 'registry write failed',
      });
    });

    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining('server.toast.autoBackupCreated'),
      'success',
    );
    expect(showToastMock).toHaveBeenCalledWith('backups.toast.registryUpdateFailed', 'warning');
  });

  it('cancels and resets Rust-owned restart state through IPC', async () => {
    const { result } = mount();
    act(() => {
      result.current.clearAutoRestartTimer(server.id);
      result.current.resetAutoRestartState(server.id);
    });

    await waitFor(() => expect(cancelAutoRestartMock).toHaveBeenCalledTimes(2));
    expect(cancelAutoRestartMock).toHaveBeenNthCalledWith(1, server.id);
    expect(cancelAutoRestartMock).toHaveBeenNthCalledWith(2, server.id, true);
  });
});
