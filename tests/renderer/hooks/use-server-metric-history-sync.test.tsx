import { act, renderHook, waitFor } from '@testing-library/react';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import type { MetricHistorySnapshot } from '@/renderer/shared/server-metrics';
import { useServerMetricHistorySync } from '@/renderer/hooks/use-server-metric-history-sync';
import { useServerMetricHistoryStore } from '@/store/serverMetricHistoryStore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  metricsHandler: undefined as ((value: MetricHistorySnapshot) => void) | undefined,
  statusHandler: undefined as
    | ((value: { serverId: string; status: string; generation?: number }) => void)
    | undefined,
  getHistory: vi.fn(),
  metricsListen: vi.fn(),
  statusListen: vi.fn(),
  disposeMetrics: vi.fn(),
  disposeStatus: vi.fn(),
}));

vi.mock('@/lib/server-commands', () => ({
  getServerMetricHistory: mocks.getHistory,
  onServerMetricsUpdated: (handler: typeof mocks.metricsHandler) => {
    mocks.metricsHandler = handler;
    return mocks.metricsListen();
  },
  onServerStatusChange: (handler: typeof mocks.statusHandler) => {
    mocks.statusHandler = handler;
    return mocks.statusListen();
  },
}));

function server(): MinecraftServer {
  return {
    id: 'server-a',
    name: 'A',
    version: '1.21',
    software: 'Paper',
    port: 25565,
    memory: 1024,
    path: '/servers/a',
    status: 'online',
  };
}

function snapshot(generation = 1, sequence = 1): MetricHistorySnapshot {
  return {
    serverId: 'server-a',
    generation,
    sequence,
    elapsedMs: sequence * 2_000,
    resource: [{ elapsedMs: sequence * 2_000, cpu: 40, memory: 512 }],
    tps: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useServerMetricHistorySync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.metricsHandler = undefined;
    mocks.statusHandler = undefined;
    mocks.metricsListen.mockResolvedValue(mocks.disposeMetrics);
    mocks.statusListen.mockResolvedValue(mocks.disposeStatus);
    mocks.getHistory.mockResolvedValue(null);
    useServerMetricHistoryStore.setState({
      snapshotsByServer: {},
      receivedAtByServer: {},
      completedGenerationByServer: {},
    });
  });

  it('subscribes before fetching history and keeps an event newer than the pending snapshot response', async () => {
    const registration = deferred<() => void>();
    const response = deferred<MetricHistorySnapshot | null>();
    mocks.metricsListen.mockReturnValueOnce(registration.promise);
    mocks.getHistory.mockReturnValueOnce(response.promise);
    const { unmount } = renderHook(() => useServerMetricHistorySync({ servers: [server()] }));
    expect(mocks.getHistory).not.toHaveBeenCalled();
    await act(async () => {
      registration.resolve(mocks.disposeMetrics);
    });
    await waitFor(() => expect(mocks.getHistory).toHaveBeenCalledWith('server-a'));

    act(() => mocks.metricsHandler?.(snapshot(1, 4)));
    await act(async () => {
      response.resolve(snapshot(1, 3));
    });
    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a'].sequence).toBe(4);
    unmount();
    expect(mocks.disposeMetrics).toHaveBeenCalledOnce();
    expect(mocks.disposeStatus).toHaveBeenCalledOnce();
  });

  it('clears the completed generation and rejects delayed updates or an old exit after restart', async () => {
    mocks.getHistory.mockResolvedValueOnce(snapshot(1, 2));
    renderHook(() => useServerMetricHistorySync({ servers: [server()] }));
    await waitFor(() =>
      expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a']).toBeDefined(),
    );
    act(() => {
      mocks.statusHandler?.({ serverId: 'server-a', status: 'offline', generation: 1 });
      mocks.metricsHandler?.(snapshot(1, 100));
    });
    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a']).toBeUndefined();
    act(() => {
      mocks.metricsHandler?.(snapshot(2, 0));
      mocks.statusHandler?.({ serverId: 'server-a', status: 'crashed', generation: 1 });
    });
    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a'].generation).toBe(2);
  });

  it('does not let a stale null response erase a newer generation and cleans deleted servers', async () => {
    useServerMetricHistoryStore.getState().applySnapshot(snapshot(1, 1));
    const response = deferred<MetricHistorySnapshot | null>();
    mocks.getHistory.mockReturnValueOnce(response.promise);
    const { rerender } = renderHook(
      ({ servers }: { servers: MinecraftServer[] }) => useServerMetricHistorySync({ servers }),
      { initialProps: { servers: [server()] } },
    );
    await waitFor(() => expect(mocks.getHistory).toHaveBeenCalledOnce());
    act(() => mocks.metricsHandler?.(snapshot(2, 1)));
    await act(async () => {
      response.resolve(null);
    });
    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a'].generation).toBe(2);
    rerender({ servers: [] });
    act(() => mocks.metricsHandler?.(snapshot(3, 1)));
    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a']).toBeUndefined();
  });

  it('disposes listeners that finish registering after unmount', async () => {
    const registration = deferred<() => void>();
    mocks.metricsListen.mockReturnValueOnce(registration.promise);
    const { unmount } = renderHook(() => useServerMetricHistorySync({ servers: [server()] }));
    unmount();
    await act(async () => {
      registration.resolve(mocks.disposeMetrics);
    });
    expect(mocks.disposeMetrics).toHaveBeenCalledOnce();
    expect(mocks.disposeStatus).toHaveBeenCalledOnce();
    expect(mocks.getHistory).not.toHaveBeenCalled();
  });
});
