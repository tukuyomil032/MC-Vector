import { beforeEach, describe, expect, it, vi } from 'vitest';

const openMock = vi.fn();
const tauriInvokeMock = vi.fn();
const tauriListenMock = vi.fn();
const logErrorMock = vi.fn();

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }));
vi.mock('@/lib/tauri-api', () => ({ tauriInvoke: tauriInvokeMock, tauriListen: tauriListenMock }));
vi.mock('@/lib/error-utils', () => ({ logError: logErrorMock }));

beforeEach(() => {
  vi.resetModules();
  openMock.mockReset();
  tauriInvokeMock.mockReset();
  tauriListenMock.mockReset();
  logErrorMock.mockReset();
});

describe('Java registry commands', () => {
  it('loads the typed Java registry from Rust', async () => {
    const versions = [{ version: 21, path: '/app-data/java/jdk-21', name: 'Java 21' }];
    tauriInvokeMock.mockResolvedValue(versions);

    const { getJavaVersions } = await import('@/lib/java-commands');
    await expect(getJavaVersions()).resolves.toEqual(versions);
    expect(tauriInvokeMock).toHaveBeenCalledWith('get_java_versions');
  });

  it('routes Java download and registration through one Rust command', async () => {
    tauriInvokeMock.mockResolvedValue('/app-data/java/jdk-21');

    const { downloadJava } = await import('@/lib/java-commands');
    await expect(downloadJava(21)).resolves.toBe(true);
    expect(tauriInvokeMock).toHaveBeenCalledTimes(1);
    expect(tauriInvokeMock).toHaveBeenCalledWith('download_java', { majorVersion: 21 });
  });

  it('reports download failures without writing renderer-owned registry state', async () => {
    const error = new Error('network error');
    tauriInvokeMock.mockRejectedValue(error);

    const { downloadJava } = await import('@/lib/java-commands');
    await expect(downloadJava(21)).resolves.toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith('downloadJava failed', error, {
      majorVersion: 21,
    });
    expect(tauriInvokeMock).toHaveBeenCalledTimes(1);
  });

  it('routes managed and custom Java deletion through the Rust authority', async () => {
    tauriInvokeMock.mockResolvedValue(undefined);

    const { deleteJava } = await import('@/lib/java-commands');
    await deleteJava(17);

    expect(tauriInvokeMock).toHaveBeenCalledWith('delete_java', { majorVersion: 17 });
  });
});

describe('selectJavaBinary', () => {
  it('returns the selected binary path', async () => {
    openMock.mockResolvedValue('/usr/local/bin/java');

    const { selectJavaBinary } = await import('@/lib/java-commands');
    await expect(selectJavaBinary()).resolves.toBe('/usr/local/bin/java');
    expect(openMock).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: 'Java Binary', extensions: ['*'] }],
    });
  });

  it('returns null when the user cancels the picker', async () => {
    openMock.mockResolvedValue(null);

    const { selectJavaBinary } = await import('@/lib/java-commands');
    await expect(selectJavaBinary()).resolves.toBeNull();
  });
});

describe('onJavaDownloadProgress', () => {
  it('subscribes to the Rust download progress event', async () => {
    const unlisten = vi.fn();
    tauriListenMock.mockResolvedValue(unlisten);

    const callback = vi.fn();
    const { onJavaDownloadProgress } = await import('@/lib/java-commands');
    await expect(onJavaDownloadProgress(callback)).resolves.toBe(unlisten);
    expect(tauriListenMock).toHaveBeenCalledWith('java-download-progress', callback);
  });
});
