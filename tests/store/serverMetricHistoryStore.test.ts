import type { MetricHistorySnapshot } from '@/renderer/shared/server-metrics';
import { useServerMetricHistoryStore } from '@/store/serverMetricHistoryStore';
import { beforeEach, describe, expect, it } from 'vitest';

function snapshot(generation = 1, sequence = 1, serverId = 'server-a'): MetricHistorySnapshot {
  return {
    serverId,
    generation,
    sequence,
    elapsedMs: sequence * 2_000,
    resource: [{ elapsedMs: sequence * 2_000, cpu: 40, memory: 512 * 1024 * 1024 }],
    tps: [{ elapsedMs: sequence * 2_000, tps: 20 }],
  };
}

describe('serverMetricHistoryStore', () => {
  beforeEach(() => {
    useServerMetricHistoryStore.setState({
      snapshotsByServer: {},
      receivedAtByServer: {},
      completedGenerationByServer: {},
    });
  });

  it('isolates servers and rejects snapshots older than the current generation or sequence', () => {
    const store = useServerMetricHistoryStore.getState();
    store.applySnapshot(snapshot(2, 5), 100);
    store.applySnapshot(snapshot(1, 100));
    store.applySnapshot(snapshot(2, 4));
    store.applySnapshot(snapshot(1, 1, 'server-b'));

    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a']).toMatchObject({
      generation: 2,
      sequence: 5,
    });
    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-b']).toMatchObject({
      generation: 1,
      sequence: 1,
    });
    expect(useServerMetricHistoryStore.getState().receivedAtByServer['server-a']).toBe(100);
  });

  it('keeps a completed-generation tombstone so delayed updates cannot restore stopped history', () => {
    const store = useServerMetricHistoryStore.getState();
    store.applySnapshot(snapshot(2, 3));
    store.clearServerMetrics('server-a', 2);
    store.applySnapshot(snapshot(2, 100));
    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a']).toBeUndefined();

    store.applySnapshot(snapshot(3, 0));
    store.clearServerMetrics('server-a', 2);
    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a']).toMatchObject({
      generation: 3,
      sequence: 0,
    });
  });

  it('accepts a later elapsed time at the same sequence without allowing the clock to move backward', () => {
    const store = useServerMetricHistoryStore.getState();
    store.applySnapshot(snapshot(), 100);
    store.applySnapshot({ ...snapshot(), elapsedMs: 3_000 }, 200);
    store.applySnapshot({ ...snapshot(), elapsedMs: 2_500 }, 300);
    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a'].elapsedMs).toBe(
      3_000,
    );
    expect(useServerMetricHistoryStore.getState().receivedAtByServer['server-a']).toBe(200);
  });

  it('copies snapshots and releases deleted server data and tombstones', () => {
    const point = snapshot();
    const store = useServerMetricHistoryStore.getState();
    store.applySnapshot(point);
    store.applySnapshot(snapshot(1, 1, 'server-b'));
    point.resource[0].cpu = 99;
    point.tps[0].tps = 1;
    expect(
      useServerMetricHistoryStore.getState().snapshotsByServer['server-a'].resource[0].cpu,
    ).toBe(40);
    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a'].tps[0].tps).toBe(
      20,
    );

    store.retainServerMetrics(['server-b']);
    expect(useServerMetricHistoryStore.getState().snapshotsByServer['server-a']).toBeUndefined();
    expect(useServerMetricHistoryStore.getState().receivedAtByServer['server-a']).toBeUndefined();
    expect(
      useServerMetricHistoryStore.getState().completedGenerationByServer['server-a'],
    ).toBeUndefined();
  });
});
