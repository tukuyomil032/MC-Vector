import { getE2eState, recordE2eCall } from '../e2e/support/e2e-runtime';

type KeyListener = (value: unknown) => void;
type ChangeListener = (key: string, value: unknown) => void;

const stores = new Map<string, Map<string, unknown>>();
const keyListeners = new Map<string, Map<string, Set<KeyListener>>>();
const changeListeners = new Map<string, Set<ChangeListener>>();

function storeData(path: string): Map<string, unknown> {
  const existing = stores.get(path);
  if (existing) return existing;
  const created = new Map<string, unknown>();
  stores.set(path, created);
  return created;
}

function cloneValue<T>(value: T): T {
  if (value === undefined) return value;
  return structuredClone(value);
}

function initialValue(path: string, key: string): unknown {
  const state = getE2eState();
  if (path.endsWith('servers.json')) {
    if (key === 'servers') return state.servers;
    if (key === 'serverTemplates') return [];
  }
  if (path.endsWith('config.json')) {
    return state.config[key];
  }
  if (path.endsWith('java.json') && key === 'javaVersions') return state.javaVersions;
  return undefined;
}

function updateRuntimeState(path: string, key: string, value: unknown): void {
  const state = getE2eState();
  if (path.endsWith('servers.json') && key === 'servers' && Array.isArray(value)) {
    state.servers = cloneValue(value);
  }
  if (path.endsWith('config.json')) {
    state.config[key] = value;
  }
  if (path.endsWith('config.json') && key === 'javaVersions' && Array.isArray(value)) {
    state.javaVersions = cloneValue(value);
  }
}

function notify(path: string, key: string, value: unknown): void {
  keyListeners
    .get(path)
    ?.get(key)
    ?.forEach((listener) => listener(value));
  changeListeners.get(path)?.forEach((listener) => listener(key, value));
}

function createMockStore(path: string) {
  const data = storeData(path);
  return {
    get: async <T>(key: string): Promise<T | null> => {
      recordE2eCall('store', 'get', { path, key });
      const value = data.has(key) ? data.get(key) : initialValue(path, key);
      return value === undefined ? null : cloneValue(value as T);
    },
    set: async (key: string, value: unknown): Promise<void> => {
      recordE2eCall('store', 'set', { path, key, value });
      data.set(key, value);
      updateRuntimeState(path, key, value);
      notify(path, key, value);
    },
    save: async (): Promise<void> => {
      recordE2eCall('store', 'save', { path });
      if (getE2eState().config.__storeSaveError === true) {
        throw new Error('E2E store save failed');
      }
    },
    delete: async (key: string): Promise<boolean> => {
      recordE2eCall('store', 'delete', { path, key });
      const deleted = data.delete(key);
      if (path.endsWith('config.json')) delete getE2eState().config[key];
      notify(path, key, null);
      return deleted;
    },
    entries: async <T>(): Promise<[string, T][]> => {
      recordE2eCall('store', 'entries', { path });
      const entries = new Map(data);
      if (path.endsWith('servers.json') && !entries.has('servers'))
        entries.set('servers', getE2eState().servers);
      if (path.endsWith('config.json')) {
        for (const [key, value] of Object.entries(getE2eState().config)) entries.set(key, value);
      }
      return [...entries.entries()] as [string, T][];
    },
    keys: async (): Promise<string[]> => {
      recordE2eCall('store', 'keys', { path });
      return (await createMockStore(path).entries()).map(([key]) => key);
    },
    values: async <T>(): Promise<T[]> => {
      recordE2eCall('store', 'values', { path });
      return (await createMockStore(path).entries()).map(([, value]) => value) as T[];
    },
    length: async (): Promise<number> => (await createMockStore(path).entries()).length,
    clear: async (): Promise<void> => {
      recordE2eCall('store', 'clear', { path });
      data.clear();
    },
    has: async (key: string): Promise<boolean> => {
      recordE2eCall('store', 'has', { path, key });
      return data.has(key) || initialValue(path, key) !== undefined;
    },
    onKeyChange: <T>(key: string, callback: (value: T | null) => void): (() => void) => {
      recordE2eCall('store', 'onKeyChange', { path, key });
      const listenersForPath = keyListeners.get(path) ?? new Map<string, Set<KeyListener>>();
      const listenersForKey = listenersForPath.get(key) ?? new Set<KeyListener>();
      listenersForKey.add(callback as KeyListener);
      listenersForPath.set(key, listenersForKey);
      keyListeners.set(path, listenersForPath);
      return () => listenersForKey.delete(callback as KeyListener);
    },
    onChange: <T>(callback: (key: string, value: T | null) => void): (() => void) => {
      recordE2eCall('store', 'onChange', { path });
      const listenersForPath = changeListeners.get(path) ?? new Set<ChangeListener>();
      listenersForPath.add(callback as ChangeListener);
      changeListeners.set(path, listenersForPath);
      return () => listenersForPath.delete(callback as ChangeListener);
    },
    reset: async (): Promise<void> => {
      recordE2eCall('store', 'reset', { path });
      data.clear();
    },
    close: async (): Promise<void> => {
      recordE2eCall('store', 'close', { path });
    },
  };
}

export async function load(path: string, _options?: unknown) {
  recordE2eCall('store', 'load', { path });
  return createMockStore(path);
}

export async function Store(path: string, _options?: unknown) {
  recordE2eCall('store', 'constructor', { path });
  return createMockStore(path);
}
