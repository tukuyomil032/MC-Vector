const storage = new Map<string, unknown>();

function createMockStore() {
  return {
    get: async <T>(key: string): Promise<T | null> => (storage.get(key) as T) ?? null,
    set: async (key: string, value: unknown): Promise<void> => {
      storage.set(key, value);
    },
    save: async (): Promise<void> => {},
    delete: async (key: string): Promise<boolean> => storage.delete(key),
    entries: async <T>(): Promise<[string, T][]> => [...storage.entries()] as [string, T][],
    keys: async (): Promise<string[]> => [...storage.keys()],
    values: async <T>(): Promise<T[]> => [...storage.values()] as T[],
    length: async (): Promise<number> => storage.size,
    clear: async (): Promise<void> => storage.clear(),
    has: async (key: string): Promise<boolean> => storage.has(key),
    onKeyChange:
      <T>(_key: string, _cb: (value: T | null) => void): (() => void) =>
      () => {},
    onChange:
      <T>(_cb: (key: string, value: T | null) => void): (() => void) =>
      () => {},
    reset: async (): Promise<void> => {},
    close: async (): Promise<void> => {},
  };
}

export async function load(_path: string, _options?: unknown) {
  return createMockStore();
}

export async function Store(_path: string, _options?: unknown) {
  return createMockStore();
}
