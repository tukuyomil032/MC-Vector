export interface MapRequestCoordinator {
  requestRender(key: string, request: () => Promise<void>): Promise<void>;
  requestTile<T>(key: string, request: () => Promise<T>): Promise<T>;
  clear(): void;
}

export function createMapRequestCoordinator(): MapRequestCoordinator {
  const renderRequests = new Map<string, Promise<void>>();
  const tileRequests = new Map<string, Promise<unknown>>();

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
    requestTile<T>(key: string, request: () => Promise<T>): Promise<T> {
      const existing = tileRequests.get(key) as Promise<T> | undefined;
      if (existing) {
        return existing;
      }
      const pending = request();
      tileRequests.set(key, pending);
      void pending.then(
        () => {
          if (tileRequests.get(key) === pending) {
            tileRequests.delete(key);
          }
        },
        () => {
          if (tileRequests.get(key) === pending) {
            tileRequests.delete(key);
          }
        },
      );
      return pending;
    },
    clear() {
      renderRequests.clear();
      tileRequests.clear();
    },
  };
}
