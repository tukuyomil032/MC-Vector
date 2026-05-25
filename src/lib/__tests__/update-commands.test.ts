import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVersionMock = vi.fn();
const relaunchMock = vi.fn();
const checkMock = vi.fn();
const tauriInvokeMock = vi.fn();
const logErrorMock = vi.fn();

vi.mock('@tauri-apps/api/app', () => ({ getVersion: getVersionMock }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: relaunchMock }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: checkMock }));
vi.mock('../tauri-api', () => ({ tauriInvoke: tauriInvokeMock, tauriListen: vi.fn() }));
vi.mock('../error-utils', () => ({ logError: logErrorMock }));
vi.mock('@/i18n', () => ({
  getTranslation: vi.fn().mockReturnValue((key: string) => key),
}));

function makeUpdate(overrides?: Partial<{ version: string; body: string | null }>) {
  return {
    version: overrides?.version ?? '2.0.56',
    body: overrides?.body !== undefined ? overrides.body : 'Bug fixes',
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.resetModules();
  getVersionMock.mockReset();
  relaunchMock.mockReset();
  checkMock.mockReset();
  tauriInvokeMock.mockReset();
  logErrorMock.mockReset();
});

describe('getAppVersion', () => {
  it('returns version string from getVersion', async () => {
    getVersionMock.mockResolvedValue('2.0.55');

    const { getAppVersion } = await import('../update-commands');
    const result = await getAppVersion();
    expect(result).toBe('2.0.55');
  });
});

describe('checkForUpdates', () => {
  it('returns available=true with version and body when update exists', async () => {
    checkMock.mockResolvedValue(makeUpdate({ version: '2.1.0', body: 'New features' }));

    const { checkForUpdates } = await import('../update-commands');
    const result = await checkForUpdates();
    expect(result).toEqual({ available: true, version: '2.1.0', body: 'New features' });
  });

  it('returns available=false when no update', async () => {
    checkMock.mockResolvedValue(null);

    const { checkForUpdates } = await import('../update-commands');
    const result = await checkForUpdates();
    expect(result).toEqual({ available: false });
  });

  it('returns available=false with error string when check throws', async () => {
    checkMock.mockRejectedValue(new Error('network timeout'));

    const { checkForUpdates } = await import('../update-commands');
    const result = await checkForUpdates();
    expect(result.available).toBe(false);
    expect(result.error).toContain('network timeout');
    expect(logErrorMock).toHaveBeenCalled();
  });

  it('normalizes signature verification error', async () => {
    checkMock.mockRejectedValue(new Error('signature verification failed'));

    const { checkForUpdates } = await import('../update-commands');
    const result = await checkForUpdates();
    expect(result.error).toContain('errors.updateSignatureVerificationFailed');
  });

  it('returns undefined body when update body is null', async () => {
    checkMock.mockResolvedValue(makeUpdate({ body: null }));

    const { checkForUpdates } = await import('../update-commands');
    const result = await checkForUpdates();
    expect(result.body).toBeUndefined();
  });
});

describe('canUpdateApp', () => {
  it('returns UpdateCheckResult from tauriInvoke', async () => {
    tauriInvokeMock.mockResolvedValue({ can_update: true });

    const { canUpdateApp } = await import('../update-commands');
    const result = await canUpdateApp();
    expect(result).toEqual({ can_update: true });
    expect(tauriInvokeMock).toHaveBeenCalledWith('can_update_app');
  });

  it('returns check_failed when tauriInvoke throws', async () => {
    tauriInvokeMock.mockRejectedValue(new Error('ipc error'));

    const { canUpdateApp } = await import('../update-commands');
    const result = await canUpdateApp();
    expect(result).toEqual({ can_update: false, reason: 'check_failed' });
    expect(logErrorMock).toHaveBeenCalled();
  });
});

describe('downloadAndInstallUpdate', () => {
  it('throws when no update is available', async () => {
    checkMock.mockResolvedValue(null);

    const { downloadAndInstallUpdate } = await import('../update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow('No update available');
  });

  it('downloads, installs, and relaunches on success', async () => {
    const update = makeUpdate();
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: true }) // can_update_app
      .mockResolvedValueOnce('/Applications/MC-Vector.app'); // get_app_location (unused)
    relaunchMock.mockResolvedValue(undefined);

    const { downloadAndInstallUpdate } = await import('../update-commands');
    await downloadAndInstallUpdate();

    expect(update.downloadAndInstall).toHaveBeenCalled();
    expect(relaunchMock).toHaveBeenCalled();
  });

  it('throws read-only error when reason is read_only', async () => {
    const update = makeUpdate();
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: false, reason: 'read_only' }) // can_update_app
      .mockResolvedValueOnce('/Downloads/MC-Vector.app'); // get_app_location

    const { downloadAndInstallUpdate } = await import('../update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow(
      /read-only location|errors\.updateReadOnlyLocation/,
    );
  });

  it('throws permission error when reason is permission_denied', async () => {
    const update = makeUpdate();
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: false, reason: 'permission_denied' }) // can_update_app
      .mockResolvedValueOnce('/Applications/MC-Vector.app'); // get_app_location

    const { downloadAndInstallUpdate } = await import('../update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow(
      /permissions to update|errors\.updatePermissionDenied/,
    );
  });

  it('throws generic error for other can_update=false reasons', async () => {
    const update = makeUpdate();
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: false, reason: 'unknown' }) // can_update_app
      .mockResolvedValueOnce('/Applications/MC-Vector.app'); // get_app_location

    const { downloadAndInstallUpdate } = await import('../update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow(
      /Cannot apply update|errors\.updateCannotApply/,
    );
  });

  it('throws read-only error when installWithProgress fails with Read-only file system', async () => {
    const update = {
      ...makeUpdate(),
      downloadAndInstall: vi.fn().mockRejectedValue(new Error('Read-only file system')),
    };
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: true }) // can_update_app
      .mockResolvedValueOnce('/Downloads/MC-Vector.app'); // get_app_location in catch

    const { downloadAndInstallUpdate } = await import('../update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow(
      /read-only location|errors\.updateReadOnlyLocation/,
    );
  });

  it('throws read-only error when installWithProgress fails with os error 30', async () => {
    const update = {
      ...makeUpdate(),
      downloadAndInstall: vi.fn().mockRejectedValue(new Error('os error 30')),
    };
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: true }) // can_update_app
      .mockResolvedValueOnce('/Downloads/MC-Vector.app'); // get_app_location in catch

    const { downloadAndInstallUpdate } = await import('../update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow(
      /read-only location|errors\.updateReadOnlyLocation/,
    );
  });

  it('calls onProgress callback with downloaded and total bytes', async () => {
    const onProgress = vi.fn();
    const update = {
      ...makeUpdate(),
      downloadAndInstall: vi.fn().mockImplementation(async (cb: (event: unknown) => void) => {
        cb({ event: 'Started', data: { contentLength: 1000 } });
        cb({ event: 'Progress', data: { chunkLength: 500 } });
        cb({ event: 'Progress', data: { chunkLength: 500 } });
        cb({ event: 'Finished', data: {} });
      }),
    };
    checkMock.mockResolvedValue(update);
    tauriInvokeMock.mockResolvedValue({ can_update: true });
    relaunchMock.mockResolvedValue(undefined);

    const { downloadAndInstallUpdate } = await import('../update-commands');
    await downloadAndInstallUpdate(onProgress);

    expect(onProgress).toHaveBeenCalledWith(500, 1000);
    expect(onProgress).toHaveBeenCalledWith(1000, 1000);
  });
});
