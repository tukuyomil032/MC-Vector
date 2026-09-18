import { useEffect, useRef } from 'react';
import {
  onMapBridgeStatus,
  onMapPlayersUpdated,
  onMapRenderProgress,
  onMapTileInvalidated,
  onMapTileReady,
} from '../api/map-commands';
import type {
  MapBridgeStatusEvent,
  MapPlayersUpdatedEvent,
  MapRenderProgressEvent,
  MapTileInvalidatedEvent,
  MapTileReadyEvent,
} from '../state/map-types';

interface UseMapEventsOptions {
  serverId: string;
  onBridgeStatus: (event: MapBridgeStatusEvent) => void;
  onPlayersUpdated: (event: MapPlayersUpdatedEvent) => void;
  onTileInvalidated: (event: MapTileInvalidatedEvent) => void;
  onTileReady: (event: MapTileReadyEvent) => void;
  onRenderProgress: (event: MapRenderProgressEvent) => void;
}

type MapEventSubscription<T> = (callback: (event: T) => void) => Promise<() => void>;

export function useMapEvents(options: UseMapEventsOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const serverId = options.serverId;
    let disposed = false;
    const unlisteners = new Set<() => void>();

    const subscribe = <T>(listen: MapEventSubscription<T>, callback: (event: T) => void) => {
      void Promise.resolve()
        .then(() => listen(callback))
        .then((unlisten) => {
          if (disposed) {
            unlisten();
            return;
          }
          unlisteners.add(unlisten);
        })
        .catch(() => {
          // Listener setup failures do not change the existing Map status flow.
        });
    };

    subscribe(onMapBridgeStatus, (event) => {
      if (event.serverId === serverId) {
        optionsRef.current.onBridgeStatus(event);
      }
    });
    subscribe(onMapPlayersUpdated, (event) => {
      if (event.serverId === serverId) {
        optionsRef.current.onPlayersUpdated(event);
      }
    });
    subscribe(onMapTileInvalidated, (event) => {
      if (event.serverId === serverId) {
        optionsRef.current.onTileInvalidated(event);
      }
    });
    subscribe(onMapTileReady, (event) => {
      if (event.serverId === serverId) {
        optionsRef.current.onTileReady(event);
      }
    });
    subscribe(onMapRenderProgress, (event) => {
      if (event.serverId === serverId) {
        optionsRef.current.onRenderProgress(event);
      }
    });

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
      unlisteners.clear();
    };
  }, [options.serverId]);
}
