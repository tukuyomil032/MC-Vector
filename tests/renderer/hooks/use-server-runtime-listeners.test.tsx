import { act, renderHook } from '@testing-library/react';
import type { Translate } from '@/i18n';
import { useServerRuntimeListeners } from '@/renderer/hooks/use-server-runtime-listeners';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { serverLogHandlers, disposeServerLog } = vi.hoisted(() => ({
  serverLogHandlers: [] as Array<(payload: unknown) => void>,
  disposeServerLog: vi.fn(),
}));

vi.mock('@/lib/server-commands', () => ({
  getServers: vi.fn().mockResolvedValue([]),
  onDownloadProgress: vi.fn().mockResolvedValue(() => {}),
  onServerLog: vi.fn((handler: (payload: unknown) => void) => {
    serverLogHandlers.push(handler);
    return Promise.resolve(disposeServerLog);
  }),
  onServerStatusChange: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@/lib/ngrok-commands', () => ({
  onNgrokStatusChange: vi.fn().mockResolvedValue(() => {}),
}));

describe('useServerRuntimeListeners', () => {
  beforeEach(() => {
    serverLogHandlers.length = 0;
    disposeServerLog.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('forwards server-log lines to the console log store', async () => {
    const appendServerLog = vi.fn();
    const { unmount } = renderHook(() =>
      useServerRuntimeListeners({
        selectedServerId: 'paper-a',
        setSelectedServerId: vi.fn(),
        setServers: vi.fn(),
        loadTemplates: vi.fn().mockResolvedValue(undefined),
        appendServerLog,
        showToast: vi.fn(),
        t: vi.fn(() => '') as unknown as Translate,
        setDownloadStatus: vi.fn(),
        setNgrokData: vi.fn(),
        handleServerStatusChange: vi.fn(),
      }),
    );

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
});
