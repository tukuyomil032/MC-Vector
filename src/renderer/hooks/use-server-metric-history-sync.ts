import {
  getServerMetricHistory,
  onServerMetricsUpdated,
  onServerStatusChange,
} from '@/lib/server-commands';
import { logError } from '@/lib/error-utils';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import { isMetricHistorySnapshot } from '@/renderer/shared/server-metrics';
import { useServerMetricHistoryStore } from '@/store/serverMetricHistoryStore';
import { useEffect, useRef, useState } from 'react';

export function useServerMetricHistorySync({ servers }: { servers: MinecraftServer[] }) {
  const serversRef = useRef(servers);
  serversRef.current = servers;
  const mountedRef = useRef(false);
  const requestedStatusesRef = useRef(new Map<string, MinecraftServer['status']>());
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;
    const unlisteners: Array<() => void> = [];
    const trackListener = async (listener: Promise<() => void>) => {
      const dispose = await listener;
      if (cancelled) {
        dispose();
      } else {
        unlisteners.push(dispose);
      }
    };
    void Promise.all([
      trackListener(
        onServerMetricsUpdated((snapshot) => {
          if (
            !cancelled &&
            isMetricHistorySnapshot(snapshot) &&
            serversRef.current.some((server) => server.id === snapshot.serverId)
          ) {
            useServerMetricHistoryStore.getState().applySnapshot(snapshot);
          }
        }),
      ),
      trackListener(
        onServerStatusChange((data) => {
          if (
            !cancelled &&
            (data.status === 'offline' || data.status === 'crashed') &&
            serversRef.current.some((server) => server.id === data.serverId) &&
            typeof data.generation === 'number' &&
            Number.isSafeInteger(data.generation) &&
            data.generation >= 0
          ) {
            useServerMetricHistoryStore
              .getState()
              .clearServerMetrics(data.serverId, data.generation);
          }
        }),
      ),
    ])
      .then(() => {
        if (!cancelled) {
          setSubscribed(true);
        }
      })
      .catch((error) => logError('Failed to subscribe to server metrics', error));

    return () => {
      cancelled = true;
      mountedRef.current = false;
      unlisteners.forEach((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    useServerMetricHistoryStore.getState().retainServerMetrics(servers.map((server) => server.id));
    const knownIds = new Set(servers.map((server) => server.id));
    for (const id of requestedStatusesRef.current.keys()) {
      if (!knownIds.has(id)) {
        requestedStatusesRef.current.delete(id);
      }
    }
    if (!subscribed) {
      return;
    }
    for (const server of servers) {
      if (requestedStatusesRef.current.get(server.id) === server.status) {
        continue;
      }
      requestedStatusesRef.current.set(server.id, server.status);
      const previous = useServerMetricHistoryStore.getState().snapshotsByServer[server.id];
      void getServerMetricHistory(server.id)
        .then((snapshot) => {
          if (
            !mountedRef.current ||
            !serversRef.current.some((candidate) => candidate.id === server.id)
          ) {
            return;
          }
          const store = useServerMetricHistoryStore.getState();
          if (isMetricHistorySnapshot(snapshot)) {
            store.applySnapshot(snapshot);
          } else if (
            snapshot === null &&
            previous &&
            store.snapshotsByServer[server.id] === previous
          ) {
            store.clearServerMetrics(server.id, previous.generation);
          }
        })
        .catch((error) =>
          logError('Failed to load server metric history', error, { serverId: server.id }),
        );
    }
  }, [servers, subscribed]);
}
