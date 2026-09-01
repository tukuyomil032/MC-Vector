import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeGet = vi.fn();
const storeSet = vi.fn();
const storeSave = vi.fn();
const loadMock = vi.fn().mockResolvedValue({ get: storeGet, set: storeSet, save: storeSave });

const appDataDirMock = vi.fn();
const openMock = vi.fn();
const tauriInvokeMock = vi.fn();
const tauriListenMock = vi.fn();
const logErrorMock = vi.fn();

vi.mock('@tauri-apps/api/path', () => ({ appDataDir: appDataDirMock }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }));
vi.mock('@tauri-apps/plugin-store', () => ({ load: loadMock }));
vi.mock('../tauri-api', () => ({ tauriInvoke: tauriInvokeMock, tauriListen: tauriListenMock }));
vi.mock('../error-utils', () => ({ logError: logErrorMock }));

beforeEach(() => {
  vi.resetModules();
  loadMock.mockReset();
  loadMock.mockResolvedValue({ get: storeGet, set: storeSet, save: storeSave });
  storeGet.mockReset();
  storeSet.mockReset();
  storeSave.mockReset();
  appDataDirMock.mockReset();
  openMock.mockReset();
  tauriInvokeMock.mockReset();
  tauriListenMock.mockReset();
  logErrorMock.mockReset();
});

describe('getJavaVersions', () => {
  it('returns java versions array from store', async () => {
    const versions = [{ version: 21, path: '/java/jdk-21', name: 'Java 21' }];
    storeGet.mockResolvedValue(versions);

    const { getJavaVersions } = await import('../java-commands');
    const result = await getJavaVersions();
    expect(result).toEqual(versions);
    expect(storeGet).toHaveBeenCalledWith('javaVersions');
  });

  it('returns empty array when store has no entry', async () => {
    storeGet.mockResolvedValue(undefined);

    const { getJavaVersions } = await import('../java-commands');
    const result = await getJavaVersions();
    expect(result).toEqual([]);
  });
});

describe('saveJavaVersions', () => {
  it('calls store.set and store.save with provided versions', async () => {
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);

    const versions = [{ version: 17, path: '/java/jdk-17', name: 'Java 17' }];
    const { saveJavaVersions } = await import('../java-commands');
    await saveJavaVersions(versions);

    expect(storeSet).toHaveBeenCalledWith('javaVersions', versions);
    expect(storeSave).toHaveBeenCalled();
  });
});

describe('downloadJava', () => {
  it('returns true and saves version entry on success', async () => {
    appDataDirMock.mockResolvedValue('/app-data');
    tauriInvokeMock.mockResolvedValue('/app-data/java/jdk-21');
    storeGet.mockResolvedValue([]);
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);

    const { downloadJava } = await import('../java-commands');
    const result = await downloadJava(21);

    expect(result).toBe(true);
    expect(tauriInvokeMock).toHaveBeenCalledWith('download_java', { majorVersion: 21 });
    expect(storeSet).toHaveBeenCalledWith(
      'javaVersions',
      expect.arrayContaining([expect.objectContaining({ version: 21 })]),
    );
  });

  it('uses zip archive type on windows', async () => {
    appDataDirMock.mockResolvedValue('C:/AppData');
    tauriInvokeMock.mockResolvedValue('C:/AppData/java/jdk-17');
    storeGet.mockResolvedValue([]);
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);

    const { downloadJava } = await import('../java-commands');
    await downloadJava(17);

    expect(tauriInvokeMock).toHaveBeenCalledWith('download_java', { majorVersion: 17 });
  });

  it('uses tar.gz archive type on macOS', async () => {
    appDataDirMock.mockResolvedValue('/Library/AppData');
    tauriInvokeMock.mockResolvedValue('/Library/AppData/java/jdk-21');
    storeGet.mockResolvedValue([]);
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);

    const { downloadJava } = await import('../java-commands');
    await downloadJava(21);

    expect(tauriInvokeMock).toHaveBeenCalledWith('download_java', { majorVersion: 21 });
  });

  it('returns false and logs error when download fails', async () => {
    appDataDirMock.mockResolvedValue('/app-data');
    tauriInvokeMock.mockRejectedValue(new Error('network error'));

    const { downloadJava } = await import('../java-commands');
    const result = await downloadJava(21);

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith('downloadJava failed', expect.any(Error), {
      majorVersion: 21,
    });
  });

  it('updates existing entry when same version already saved', async () => {
    appDataDirMock.mockResolvedValue('/app-data');
    tauriInvokeMock.mockResolvedValue('/app-data/java/jdk-21/new-path');
    storeGet.mockResolvedValue([
      { version: 21, path: '/app-data/java/jdk-21/old-path', name: 'Java 21' },
    ]);
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);

    const { downloadJava } = await import('../java-commands');
    await downloadJava(21);

    const savedVersions = storeSet.mock.calls[0][1] as unknown[];
    expect(savedVersions).toHaveLength(1);
    expect(savedVersions[0]).toMatchObject({ version: 21, path: '/app-data/java/jdk-21/new-path' });
  });
});

describe('deleteJava', () => {
  it('does nothing when version is not found in store', async () => {
    storeGet.mockResolvedValue([{ version: 17, path: '/java/jdk-17', name: 'Java 17' }]);

    const { deleteJava } = await import('../java-commands');
    await deleteJava(21);

    expect(tauriInvokeMock).not.toHaveBeenCalled();
    expect(storeSet).not.toHaveBeenCalled();
  });

  it('only removes from store when version is custom', async () => {
    storeGet.mockResolvedValue([
      { version: 21, path: '/custom/java/jdk-21', name: 'Custom Java 21', isCustom: true },
    ]);
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);

    const { deleteJava } = await import('../java-commands');
    await deleteJava(21);

    expect(tauriInvokeMock).not.toHaveBeenCalled();
    expect(storeSet).toHaveBeenCalledWith('javaVersions', []);
  });

  it('removes filesystem path and store entry for managed version', async () => {
    storeGet.mockResolvedValue([{ version: 21, path: '/app-data/java/jdk-21', name: 'Java 21' }]);
    appDataDirMock.mockResolvedValue('/app-data');
    tauriInvokeMock.mockResolvedValue(undefined);
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);

    const { deleteJava } = await import('../java-commands');
    await deleteJava(21);

    expect(tauriInvokeMock).toHaveBeenCalledWith('delete_managed_path', {
      request: { root: 'java', relativePath: 'jdk-21' },
    });
    expect(storeSet).toHaveBeenCalledWith('javaVersions', []);
  });

  it('propagates managed deletion errors', async () => {
    storeGet.mockResolvedValue([{ version: 21, path: '/app-data/java/jdk-21', name: 'Java 21' }]);
    appDataDirMock.mockResolvedValue('/app-data');
    tauriInvokeMock.mockRejectedValue(new Error('No such file or directory'));
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);

    const { deleteJava } = await import('../java-commands');
    await expect(deleteJava(21)).rejects.toThrow('No such file or directory');
    expect(storeSet).not.toHaveBeenCalled();
  });

  it('throws when a non-not-found error occurs during removal', async () => {
    storeGet.mockResolvedValue([{ version: 21, path: '/app-data/java/jdk-21', name: 'Java 21' }]);
    appDataDirMock.mockResolvedValue('/app-data');
    tauriInvokeMock.mockRejectedValue(new Error('permission denied'));

    const { deleteJava } = await import('../java-commands');
    await expect(deleteJava(21)).rejects.toThrow('permission denied');
  });

  it('handles macOS JDK Contents/Home path by stripping the marker', async () => {
    storeGet.mockResolvedValue([
      {
        version: 21,
        path: '/app-data/java/jdk-21/Contents/Home',
        name: 'Java 21',
      },
    ]);
    appDataDirMock.mockResolvedValue('/app-data');
    tauriInvokeMock.mockResolvedValue(undefined);
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);

    const { deleteJava } = await import('../java-commands');
    await deleteJava(21);

    expect(tauriInvokeMock).toHaveBeenCalledWith('delete_managed_path', {
      request: { root: 'java', relativePath: 'jdk-21' },
    });
  });

  it('filters out paths outside the managed java directory', async () => {
    storeGet.mockResolvedValue([{ version: 21, path: '/custom/external/jdk-21', name: 'Java 21' }]);
    appDataDirMock.mockResolvedValue('/app-data');
    tauriInvokeMock.mockResolvedValue(undefined);
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);

    const { deleteJava } = await import('../java-commands');
    await deleteJava(21);

    // Stored paths cannot redirect the deletion target.
    expect(tauriInvokeMock).toHaveBeenCalledWith('delete_managed_path', {
      request: { root: 'java', relativePath: 'jdk-21' },
    });
  });
});

describe('onJavaDownloadProgress', () => {
  it('calls tauriListen with java-download-progress event', async () => {
    const unlistenFn = vi.fn();
    tauriListenMock.mockResolvedValue(unlistenFn);

    const callback = vi.fn();
    const { onJavaDownloadProgress } = await import('../java-commands');
    const result = await onJavaDownloadProgress(callback);

    expect(tauriListenMock).toHaveBeenCalledWith('java-download-progress', callback);
    expect(result).toBe(unlistenFn);
  });
});
