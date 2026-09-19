import { useEffect, useRef } from 'react';
import {
  onMapBridgeStatus,
  onMapChatMessage,
  onMapPlayersUpdated,
  onMapRenderProgress,
  onMapTileInvalidated,
  onMapTileReady,
  onMapWorldStatus,
} from '../api/map-commands';
import type {
  MapBridgeStatusEvent,
  MapChatMessageEvent,
  MapPlayersUpdatedEvent,
  MapRenderProgressEvent,
  MapTileInvalidatedEvent,
  MapTileReadyEvent,
  MapWorldStatusEvent,
} from '../state/map-types';

interface UseMapEventsOptions {
  serverId: string;
  onBridgeStatus: (event: MapBridgeStatusEvent) => void;
  onChatMessage: (event: MapChatMessageEvent) => void;
  onPlayersUpdated: (event: MapPlayersUpdatedEvent) => void;
  onWorldStatus: (event: MapWorldStatusEvent) => void;
  onTileInvalidated: (event: MapTileInvalidatedEvent) => void;
  onTileReady: (event: MapTileReadyEvent) => void;
  onRenderProgress: (event: MapRenderProgressEvent) => void;
}

type MapUnlisten = () => void | Promise<void>;
type MapEventSubscription<T> = (callback: (event: T) => void) => Promise<MapUnlisten>;
type SafeDisposer = () => Promise<void>;

function createSafeDisposer(unlisten: MapUnlisten): SafeDisposer {
  let disposal: Promise<void> | null = null;

  return () => {
    if (!disposal) {
      disposal = Promise.resolve()
        .then(() => unlisten())
        .then(
          () => undefined,
          () => undefined,
        );
    }
    return disposal;
  };
}

export function useMapEvents(options: UseMapEventsOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const serverId = options.serverId;
    let disposed = false;
    const unlisteners = new Set<SafeDisposer>();

    const subscribe = <T>(listen: MapEventSubscription<T>, callback: (event: T) => void) => {
      void Promise.resolve()
        .then(() => listen(callback))
        .then((unlisten) => {
          const dispose = createSafeDisposer(unlisten);
          if (disposed) {
            void dispose();
            return;
          }
          unlisteners.add(dispose);
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
    subscribe(onMapChatMessage, (event) => {
      if (event.serverId === serverId) {
        optionsRef.current.onChatMessage(event);
      }
    });
    subscribe(onMapPlayersUpdated, (event) => {
      if (event.serverId === serverId) {
        optionsRef.current.onPlayersUpdated(event);
      }
    });
    subscribe(onMapWorldStatus, (event) => {
      if (event.serverId === serverId) {
        optionsRef.current.onWorldStatus(event);
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
      for (const dispose of unlisteners) {
        void dispose();
      }
      unlisteners.clear();
    };
  }, [options.serverId]);
}
