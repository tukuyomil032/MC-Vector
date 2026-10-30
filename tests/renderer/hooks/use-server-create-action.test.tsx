import type { Translate } from '@/i18n';
import { useServerCreateAction } from '@/renderer/hooks/use-server-create-action';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createServerProfileMock,
  onServerCreationProgressMock,
  setServersMock,
  setSelectedServerIdMock,
  setShowAddServerModalMock,
  setDownloadStatusMock,
  showToastMock,
} = vi.hoisted(() => ({
  createServerProfileMock: vi.fn(),
  onServerCreationProgressMock: vi.fn(),
  setServersMock: vi.fn(),
  setSelectedServerIdMock: vi.fn(),
  setShowAddServerModalMock: vi.fn(),
  setDownloadStatusMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('@/lib/server-creation-commands', () => ({
  createServerProfile: createServerProfileMock,
  onServerCreationProgress: onServerCreationProgressMock,
}));

vi.mock('@/lib/error-utils', () => ({ logError: vi.fn() }));

const translate = ((key: string) => key) as Translate;
const server: MinecraftServer = {
  id: 'rust-server-id',
  name: 'Survival',
  version: '1.21.10',
  software: 'Paper',
  port: 25565,
  memory: 4096,
  path: '/mock/servers/rust-server-id',
  status: 'offline',
};

function ServerCreateHarness({ data = { name: 'Survival' } }: { data?: unknown }) {
  const { handleAddServer } = useServerCreateAction({
    setServers: setServersMock,
    setSelectedServerId: setSelectedServerIdMock,
    setShowAddServerModal: setShowAddServerModalMock,
    setDownloadStatus: setDownloadStatusMock,
    showToast: showToastMock,
    t: translate,
  });

  return (
    <button type="button" onClick={() => void handleAddServer(data)}>
      Create server
    </button>
  );
}

describe('use-server-create-action', () => {
  beforeEach(() => {
    createServerProfileMock.mockReset();
    onServerCreationProgressMock.mockReset();
    setServersMock.mockReset();
    setSelectedServerIdMock.mockReset();
    setShowAddServerModalMock.mockReset();
    setDownloadStatusMock.mockReset();
    showToastMock.mockReset();
    vi.stubGlobal('crypto', { randomUUID: () => 'correlation-id' });
    onServerCreationProgressMock.mockResolvedValue(vi.fn());
    createServerProfileMock.mockResolvedValue({ server, jarInstalled: true });
  });

  it('sends an id-less request and applies the profile returned by Rust', async () => {
    render(
      <ServerCreateHarness
        data={{
          name: 'Survival',
          software: 'Paper',
          version: '1.21.10',
          port: 25565,
          memory: 4,
          path: '/untrusted/renderer/path',
          id: 'renderer-chosen-id',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create server' }));

    await waitFor(() => expect(createServerProfileMock).toHaveBeenCalledTimes(1));
    const [request] = createServerProfileMock.mock.calls[0] as [Record<string, unknown>];
    expect(request).toMatchObject({
      operationId: 'correlation-id',
      name: 'Survival',
      software: 'Paper',
      version: '1.21.10',
      port: 25565,
      memoryGb: 4,
    });
    expect(request).not.toHaveProperty('id');
    expect(request).not.toHaveProperty('path');
    await waitFor(() => expect(setSelectedServerIdMock).toHaveBeenCalledWith('rust-server-id'));
    expect(setServersMock).toHaveBeenCalledWith(expect.any(Function));
    expect(setShowAddServerModalMock).toHaveBeenCalledWith(false);
    expect(showToastMock).toHaveBeenCalledWith('server.toast.created', 'success');
    expect(setDownloadStatusMock).toHaveBeenLastCalledWith(null);
  });

  it('filters progress by operation ID and unlistens after creation', async () => {
    const unlisten = vi.fn();
    let receiveProgress:
      | ((event: { operationId: string; progress: number; status: string }) => void)
      | undefined;
    onServerCreationProgressMock.mockImplementation(async (callback) => {
      receiveProgress = callback;
      return unlisten;
    });
    render(<ServerCreateHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Create server' }));
    await waitFor(() => expect(createServerProfileMock).toHaveBeenCalledTimes(1));
    receiveProgress?.({ operationId: 'another-operation', progress: 80, status: 'other' });
    receiveProgress?.({
      operationId: 'correlation-id',
      progress: 40,
      status: 'Downloading... 40%',
    });

    await waitFor(() =>
      expect(setDownloadStatusMock).toHaveBeenCalledWith({
        id: 'correlation-id',
        progress: 40,
        msg: 'Downloading... 40%',
      }),
    );
    await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });

  it('does not submit twice while Rust is completing the first request', async () => {
    let resolveCreation:
      | ((value: { server: MinecraftServer; jarInstalled: boolean }) => void)
      | undefined;
    createServerProfileMock.mockImplementation(
      () => new Promise((resolve) => (resolveCreation = resolve)),
    );
    render(<ServerCreateHarness />);
    const button = screen.getByRole('button', { name: 'Create server' });

    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(createServerProfileMock).toHaveBeenCalledTimes(1));
    resolveCreation?.({ server, jarInstalled: true });
    await waitFor(() => expect(setShowAddServerModalMock).toHaveBeenCalledWith(false));
  });
});
