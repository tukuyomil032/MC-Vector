export interface MapRequestCoordinator {
  requestRender(key: string, request: () => Promise<void>): Promise<void>;
  beginTileGeneration(): number;
  requestTile<T>(key: string, request: () => Promise<T>, generation?: number): Promise<T>;
  cleanupTileGeneration(generation: number): void;
  clear(): void;
}

interface MapRequestCoordinatorOptions {
  maxInFlightTiles?: number;
}

interface TileRequestEntry {
  key: string;
  generation: number;
  sequence: number;
  started: boolean;
  request: () => Promise<unknown>;
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

const DEFAULT_MAX_IN_FLIGHT_TILES = 4;

export function createMapRequestCoordinator(
  options: MapRequestCoordinatorOptions = {},
): MapRequestCoordinator {
  const renderRequests = new Map<string, Promise<void>>();
  const tileRequests = new Map<string, TileRequestEntry>();
  const pendingTileRequests = new Set<TileRequestEntry>();
  const maxInFlightTiles = Math.max(
    1,
    Math.floor(options.maxInFlightTiles ?? DEFAULT_MAX_IN_FLIGHT_TILES),
  );
  let activeTileRequests = 0;
  let tileGeneration = 0;
  let tileSequence = 0;

  const pumpTileRequests = () => {
    while (activeTileRequests < maxInFlightTiles && pendingTileRequests.size > 0) {
      const next = [...pendingTileRequests].sort(
        (left, right) => right.generation - left.generation || left.sequence - right.sequence,
      )[0];
      if (!next) {
        return;
      }
      pendingTileRequests.delete(next);
      if (tileRequests.get(next.key) !== next) {
        continue;
      }

      next.started = true;
      activeTileRequests += 1;
      void Promise.resolve()
        .then(() => next.request())
        .then(
          (value) => next.resolve(value),
          (reason: unknown) => next.reject(reason),
        )
        .finally(() => {
          activeTileRequests -= 1;
          if (tileRequests.get(next.key) === next) {
            tileRequests.delete(next.key);
          }
          pumpTileRequests();
        });
    }
  };

  const rejectPendingTileRequest = (entry: TileRequestEntry) => {
    pendingTileRequests.delete(entry);
    if (tileRequests.get(entry.key) === entry) {
      tileRequests.delete(entry.key);
    }
    entry.reject(new Error('Map tile request was superseded by a newer viewport'));
  };

  return {
    requestRender(key, request) {
      const existing = renderRequests.get(key);
      if (existing) {
        return existing;
      }
      const pending = request();
      renderRequests.set(key, pending);
      void pending.catch(() => {
        if (renderRequests.get(key) === pending) {
          renderRequests.delete(key);
        }
      });
      return pending;
    },
    beginTileGeneration() {
      tileGeneration += 1;
      return tileGeneration;
    },
    requestTile<T>(
      key: string,
      request: () => Promise<T>,
      generation = tileGeneration,
    ): Promise<T> {
      const existing = tileRequests.get(key);
      if (existing) {
        if (!existing.started && generation > existing.generation) {
          existing.generation = generation;
        }
        return existing.promise as Promise<T>;
      }
      if (generation < tileGeneration) {
        return Promise.reject(new Error('Map tile request was superseded by a newer viewport'));
      }

      let resolvePromise!: (value: T | PromiseLike<T>) => void;
      let rejectPromise!: (reason?: unknown) => void;
      const promise = new Promise<T>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
      const entry: TileRequestEntry = {
        key,
        generation,
        sequence: tileSequence++,
        started: false,
        request: () => request(),
        promise,
        resolve: (value) => resolvePromise(value as T),
        reject: rejectPromise,
      };
      tileRequests.set(key, entry);
      pendingTileRequests.add(entry);
      pumpTileRequests();
      return promise;
    },
    cleanupTileGeneration(generation) {
      [...pendingTileRequests]
        .filter((entry) => entry.generation < generation)
        .forEach(rejectPendingTileRequest);
      pumpTileRequests();
    },
    clear() {
      renderRequests.clear();
      tileGeneration += 1;
      [...pendingTileRequests].forEach(rejectPendingTileRequest);
      pumpTileRequests();
    },
  };
}
