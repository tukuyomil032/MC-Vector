import { create } from 'zustand';
import type { MetricHistorySnapshot } from '@/renderer/shared/server-metrics';

interface ServerMetricHistoryState {
  snapshotsByServer: Record<string, MetricHistorySnapshot>;
  receivedAtByServer: Record<string, number>;
  completedGenerationByServer: Record<string, number>;
  applySnapshot: (snapshot: MetricHistorySnapshot, receivedAt?: number) => void;
  clearServerMetrics: (serverId: string, generation: number) => void;
  retainServerMetrics: (serverIds: readonly string[]) => void;
}

export const useServerMetricHistoryStore = create<ServerMetricHistoryState>((set) => ({
  snapshotsByServer: {},
  receivedAtByServer: {},
  completedGenerationByServer: {},
  applySnapshot: (snapshot, receivedAt = performance.now()) => {
    set((state) => {
      if (snapshot.generation <= (state.completedGenerationByServer[snapshot.serverId] ?? -1)) {
        return state;
      }
      const previous = state.snapshotsByServer[snapshot.serverId];
      if (
        previous &&
        (snapshot.generation < previous.generation ||
          (snapshot.generation === previous.generation &&
            (snapshot.sequence < previous.sequence ||
              (snapshot.sequence === previous.sequence &&
                snapshot.elapsedMs <= previous.elapsedMs))))
      ) {
        return state;
      }
      return {
        snapshotsByServer: {
          ...state.snapshotsByServer,
          [snapshot.serverId]: {
            ...snapshot,
            resource: snapshot.resource.map((point) => ({ ...point })),
            tps: snapshot.tps.map((point) => ({ ...point })),
          },
        },
        receivedAtByServer: { ...state.receivedAtByServer, [snapshot.serverId]: receivedAt },
      };
    });
  },
  clearServerMetrics: (serverId, generation) => {
    set((state) => {
      const completedGeneration = Math.max(
        generation,
        state.completedGenerationByServer[serverId] ?? -1,
      );
      const previous = state.snapshotsByServer[serverId];
      const snapshotsByServer = { ...state.snapshotsByServer };
      const receivedAtByServer = { ...state.receivedAtByServer };
      if (previous && previous.generation <= completedGeneration) {
        delete snapshotsByServer[serverId];
        delete receivedAtByServer[serverId];
      }
      return {
        snapshotsByServer,
        receivedAtByServer,
        completedGenerationByServer: {
          ...state.completedGenerationByServer,
          [serverId]: completedGeneration,
        },
      };
    });
  },
  retainServerMetrics: (serverIds) => {
    const retainedIds = new Set(serverIds);
    set((state) => {
      const removedIds = [
        ...new Set([
          ...Object.keys(state.snapshotsByServer),
          ...Object.keys(state.receivedAtByServer),
          ...Object.keys(state.completedGenerationByServer),
        ]),
      ].filter((id) => !retainedIds.has(id));
      if (removedIds.length === 0) {
        return state;
      }
      const snapshotsByServer = { ...state.snapshotsByServer };
      const receivedAtByServer = { ...state.receivedAtByServer };
      const completedGenerationByServer = { ...state.completedGenerationByServer };
      for (const id of removedIds) {
        delete snapshotsByServer[id];
        delete receivedAtByServer[id];
        delete completedGenerationByServer[id];
      }
      return { snapshotsByServer, receivedAtByServer, completedGenerationByServer };
    });
  },
}));
