import { act, renderHook, waitFor } from '@testing-library/react';
import type { Translate } from '@/i18n';
import { useServerRuntimeListeners } from '@/renderer/hooks/use-server-runtime-listeners';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { serverLogHandlers, downloadHandlers, disposeServerLog, notifyMock } = vi.hoisted(() => ({
  serverLogHandlers: [] as Array<(payload: unknown) => void>,
  downloadHandlers: [] as Array<(payload: unknown) => void>,
  disposeServerLog: vi.fn(),
  notifyMock: {
    progress: vi.fn(),
    done: vi.fn(),
  },
}));

vi.mock('@/lib/server-commands', () => ({
  getServers: vi.fn().mockResolvedValue([]),
  onDownloadProgress: vi.fn((handler: (payload: unknown) => void) => {
    downloadHandlers.push(handler);
    return Promise.resolve(() => {});
  }),
  onServerLog: vi.fn((handler: (payload: unknown) => void) => {
    serverLogHandlers.push(handler);
    return Promise.resolve(disposeServerLog);
  }),
  onServerStatusChange: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@/lib/ngrok-commands', () => ({
  onNgrokStatusChange: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@/renderer/shared/notify', () => ({ notify: notifyMock }));

const translate = ((key: string) => key) as Translate;

function renderListeners(appendServerLog = vi.fn()) {
  return renderHook(() =>
    useServerRuntimeListeners({
      selectedServerId: 'paper-a',
      setSelectedServerId: vi.fn(),
      setServers: vi.fn(),
      loadTemplates: vi.fn().mockResolvedValue(undefined),
      appendServerLog,
      showToast: vi.fn(),
      t: translate,
      setNgrokData: vi.fn(),
      handleServerStatusChange: vi.fn(),
    }),
  );
}

describe('useServerRuntimeListeners', () => {
  beforeEach(() => {
    serverLogHandlers.length = 0;
    downloadHandlers.length = 0;
    disposeServerLog.mockReset();
    notifyMock.progress.mockReset();
    notifyMock.done.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('forwards server-log lines to the console log store', async () => {
    const appendServerLog = vi.fn();
    const { unmount } = renderListeners(appendServerLog);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      serverLogHandlers[0]?.({ serverId: 'paper-a', line: 'Current TPS: 19.5\n' });
    });

    expect(appendServerLog).toHaveBeenCalledWith('paper-a', 'Current TPS: 19.5\r\n');

    unmount();
    expect(disposeServerLog).toHaveBeenCalledOnce();
  });

  it('keeps one download toast per server and replaces it when the download completes', async () => {
    const { unmount } = renderListeners();
    await waitFor(() => expect(downloadHandlers).toHaveLength(1));

    act(() => {
      downloadHandlers[0]?.({ serverId: 'paper-a', progress: 42 });
    });
    expect(notifyMock.progress).toHaveBeenCalledWith('server-download-paper-a', {
      title: 'common.downloading',
      progress: 42,
    });

    act(() => {
      downloadHandlers[0]?.({ serverId: 'paper-a', progress: 100 });
    });
    expect(notifyMock.done).toHaveBeenCalledWith('server-download-paper-a', {
      type: 'success',
      title: 'server.toast.downloadComplete',
    });

    unmount();
  });
});
