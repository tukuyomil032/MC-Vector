import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVersionMock = vi.fn();
const relaunchMock = vi.fn();
const checkMock = vi.fn();
const tauriInvokeMock = vi.fn();
const logErrorMock = vi.fn();
const platformMock = vi.fn();
const archMock = vi.fn();
const getAppSettingsMock = vi.fn();

vi.mock('@tauri-apps/api/app', () => ({ getVersion: getVersionMock }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: relaunchMock }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: checkMock }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: platformMock, arch: archMock }));
vi.mock('@/lib/tauri-api', () => ({ tauriInvoke: tauriInvokeMock, tauriListen: vi.fn() }));
vi.mock('@/lib/config-commands', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/lib/error-utils', () => ({ logError: logErrorMock }));
vi.mock('@/i18n', () => ({
  getTranslation: vi.fn().mockReturnValue((key: string) => key),
}));

function makeUpdate(overrides?: Partial<{ version: string; body: string | null }>) {
  return {
    version: overrides?.version ?? '2.0.56',
    body: overrides?.body !== undefined ? overrides.body : 'Bug fixes',
    download: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.resetModules();
  getVersionMock.mockReset();
  relaunchMock.mockReset();
  checkMock.mockReset();
  tauriInvokeMock.mockReset();
  logErrorMock.mockReset();
  platformMock.mockReset().mockReturnValue('macos');
  archMock.mockReset().mockReturnValue('aarch64');
  getAppSettingsMock.mockReset().mockResolvedValue({ updateChannel: 'stable' });
});

describe('getAppVersion', () => {
  it('returns version string from getVersion', async () => {
    getVersionMock.mockResolvedValue('2.0.55');

    const { getAppVersion } = await import('@/lib/update-commands');
    const result = await getAppVersion();
    expect(result).toBe('2.0.55');
  });
});

describe('update targets and channels', () => {
  it.each([
    ['stable', 'macos', 'aarch64', 'stable-darwin-aarch64'],
    ['beta', 'macos', 'x86_64', 'beta-darwin-x86_64'],
    ['stable', 'windows', 'x86_64', 'stable-windows-x86_64'],
    ['beta', 'windows', 'x86_64', 'beta-windows-x86_64'],
  ] as const)('maps %s %s/%s to %s', async (channel, os, architecture, expected) => {
    const { getUpdateTarget } = await import('@/lib/update-commands');
    expect(getUpdateTarget(channel, os, architecture)).toBe(expected);
  });

  it('rejects unsupported platform and architecture combinations', async () => {
    const { getUpdateTarget } = await import('@/lib/update-commands');
    expect(() => getUpdateTarget('stable', 'linux', 'x86_64')).toThrow(
      'Unsupported update platform',
    );
    expect(() => getUpdateTarget('stable', 'windows', 'aarch64')).toThrow(
      'Unsupported update architecture',
    );
  });
});

describe('checkForUpdates', () => {
  it('returns available=true with version and body when update exists', async () => {
    checkMock.mockResolvedValue(makeUpdate({ version: '2.1.0', body: 'New features' }));

    const { checkForUpdates } = await import('@/lib/update-commands');
    const result = await checkForUpdates();
    expect(result).toEqual({ available: true, version: '2.1.0', body: 'New features' });
    expect(checkMock).toHaveBeenCalledWith({ target: 'stable-darwin-aarch64' });
  });

  it('does not start a plugin check when the channel changes during settings loading', async () => {
    let resolveSettings!: (settings: { updateChannel: string }) => void;
    getAppSettingsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSettings = resolve;
        }),
    );

    const { checkForUpdates, clearPendingUpdate } = await import('@/lib/update-commands');
    const checkPromise = checkForUpdates();
    clearPendingUpdate();
    resolveSettings({ updateChannel: 'beta' });

    await expect(checkPromise).resolves.toEqual({ available: false });
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('closes an update returned after the channel generation changed during plugin check', async () => {
    let resolvePluginCheck!: (update: ReturnType<typeof makeUpdate>) => void;
    const staleUpdate = makeUpdate({ version: '2.0.64-old' });
    checkMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePluginCheck = resolve;
          }),
      )
      .mockResolvedValueOnce(null);

    const { checkForUpdates, clearPendingUpdate, downloadAndInstallUpdate } =
      await import('@/lib/update-commands');
    const checkPromise = checkForUpdates();
    await vi.waitFor(() => expect(checkMock).toHaveBeenCalledTimes(1));

    clearPendingUpdate();
    resolvePluginCheck(staleUpdate);

    await expect(checkPromise).resolves.toEqual({ available: false });
    await expect(downloadAndInstallUpdate()).rejects.toThrow('No update available');
    expect(staleUpdate.close).toHaveBeenCalledTimes(1);
    expect(staleUpdate.download).not.toHaveBeenCalled();
    expect(checkMock).toHaveBeenCalledTimes(2);
  });

  it('keeps beta selected when the beta feed returns a stable-version response', async () => {
    getAppSettingsMock.mockResolvedValue({ updateChannel: 'beta' });
    checkMock.mockResolvedValue(makeUpdate({ version: '2.0.64' }));

    const { checkForUpdates } = await import('@/lib/update-commands');
    const result = await checkForUpdates();

    expect(result).toEqual({ available: true, version: '2.0.64', body: 'Bug fixes' });
    expect(checkMock).toHaveBeenCalledWith({ target: 'beta-darwin-aarch64' });
    expect(getAppSettingsMock).toHaveBeenCalledTimes(1);
    await expect(getAppSettingsMock()).resolves.toEqual({ updateChannel: 'beta' });
  });

  it('does not opt into updater downgrades for a stable target', async () => {
    checkMock.mockResolvedValue(makeUpdate({ version: '2.0.64' }));

    const { checkForUpdates } = await import('@/lib/update-commands');
    await checkForUpdates();

    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(checkMock).toHaveBeenCalledWith({ target: 'stable-darwin-aarch64' });
    expect(checkMock.mock.calls[0][0]).not.toHaveProperty('allowDowngrades');
  });

  it('returns available=false when no update', async () => {
    checkMock.mockResolvedValue(null);

    const { checkForUpdates } = await import('@/lib/update-commands');
    const result = await checkForUpdates();
    expect(result).toEqual({ available: false });
  });

  it('returns available=false with error string when check throws', async () => {
    checkMock.mockRejectedValue(new Error('network timeout'));

    const { checkForUpdates } = await import('@/lib/update-commands');
    const result = await checkForUpdates();
    expect(result.available).toBe(false);
    expect(result.error).toContain('network timeout');
    expect(logErrorMock).toHaveBeenCalled();
  });

  it('normalizes signature verification error', async () => {
    checkMock.mockRejectedValue(new Error('signature verification failed'));

    const { checkForUpdates } = await import('@/lib/update-commands');
    const result = await checkForUpdates();
    expect(result.error).toContain('errors.updateSignatureVerificationFailed');
  });

  it('returns undefined body when update body is null', async () => {
    checkMock.mockResolvedValue(makeUpdate({ body: null }));

    const { checkForUpdates } = await import('@/lib/update-commands');
    const result = await checkForUpdates();
    expect(result.body).toBeUndefined();
  });
});

describe('canUpdateApp', () => {
  it('returns UpdateCheckResult from tauriInvoke', async () => {
    tauriInvokeMock.mockResolvedValue({ can_update: true });

    const { canUpdateApp } = await import('@/lib/update-commands');
    const result = await canUpdateApp();
    expect(result).toEqual({ can_update: true });
    expect(tauriInvokeMock).toHaveBeenCalledWith('can_update_app');
  });

  it('returns check_failed when tauriInvoke throws', async () => {
    tauriInvokeMock.mockRejectedValue(new Error('ipc error'));

    const { canUpdateApp } = await import('@/lib/update-commands');
    const result = await canUpdateApp();
    expect(result).toEqual({ can_update: false, reason: 'check_failed' });
    expect(logErrorMock).toHaveBeenCalled();
  });
});

describe('downloadAndInstallUpdate', () => {
  it('throws when no update is available', async () => {
    checkMock.mockResolvedValue(null);

    const { downloadAndInstallUpdate } = await import('@/lib/update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow('No update available');
  });

  it('downloads, installs, and relaunches on success', async () => {
    const update = makeUpdate();
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: true }) // can_update_app
      .mockResolvedValueOnce('/Applications/MC-Vector.app'); // get_app_location (unused)
    relaunchMock.mockResolvedValue(undefined);

    const { downloadAndInstallUpdate } = await import('@/lib/update-commands');
    await downloadAndInstallUpdate();

    expect(update.download).toHaveBeenCalled();
    expect(update.install).toHaveBeenCalled();
    expect(relaunchMock).toHaveBeenCalled();
  });

  it('throws read-only error when reason is read_only', async () => {
    const update = makeUpdate();
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: false, reason: 'read_only' }) // can_update_app
      .mockResolvedValueOnce('/Downloads/MC-Vector.app'); // get_app_location

    const { downloadAndInstallUpdate } = await import('@/lib/update-commands');
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

    const { downloadAndInstallUpdate } = await import('@/lib/update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow(
      /permissions to update|errors\.updatePermissionDenied/,
    );
  });

  it('explains App Translocation and blocks the update download', async () => {
    const update = makeUpdate();
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: false, reason: 'app_translocated' }) // can_update_app
      .mockResolvedValueOnce(
        '/private/var/folders/ab/cdef/T/AppTranslocation/ABC123/d/MC-Vector.app',
      ); // get_app_location

    const { downloadAndInstallUpdate } = await import('@/lib/update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow(
      /errors\.updateAppTranslocatedTitle[\s\S]*errors\.updateAppTranslocatedStep4/,
    );

    expect(update.download).not.toHaveBeenCalled();
    expect(update.install).not.toHaveBeenCalled();
  });

  it('throws generic error for other can_update=false reasons', async () => {
    const update = makeUpdate();
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: false, reason: 'unknown' }) // can_update_app
      .mockResolvedValueOnce('/Applications/MC-Vector.app'); // get_app_location

    const { downloadAndInstallUpdate } = await import('@/lib/update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow(
      /Cannot apply update|errors\.updateCannotApply/,
    );
  });

  it('throws read-only error when installWithProgress fails with Read-only file system', async () => {
    const update = {
      ...makeUpdate(),
      install: vi.fn().mockRejectedValue(new Error('Read-only file system')),
    };
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: true }) // can_update_app
      .mockResolvedValueOnce('/Downloads/MC-Vector.app'); // get_app_location in catch

    const { downloadAndInstallUpdate } = await import('@/lib/update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow(
      /read-only location|errors\.updateReadOnlyLocation/,
    );
  });

  it('throws read-only error when installWithProgress fails with os error 30', async () => {
    const update = {
      ...makeUpdate(),
      install: vi.fn().mockRejectedValue(new Error('os error 30')),
    };
    checkMock.mockResolvedValue(update);
    tauriInvokeMock
      .mockResolvedValueOnce({ can_update: true }) // can_update_app
      .mockResolvedValueOnce('/Downloads/MC-Vector.app'); // get_app_location in catch

    const { downloadAndInstallUpdate } = await import('@/lib/update-commands');
    await expect(downloadAndInstallUpdate()).rejects.toThrow(
      /read-only location|errors\.updateReadOnlyLocation/,
    );
  });

  it('calls onProgress callback with downloaded and total bytes', async () => {
    const onProgress = vi.fn();
    const update = {
      ...makeUpdate(),
      download: vi.fn().mockImplementation(async (cb: (event: unknown) => void) => {
        cb({ event: 'Started', data: { contentLength: 1000 } });
        cb({ event: 'Progress', data: { chunkLength: 500 } });
        cb({ event: 'Progress', data: { chunkLength: 500 } });
        cb({ event: 'Finished', data: {} });
      }),
    };
    checkMock.mockResolvedValue(update);
    tauriInvokeMock.mockResolvedValue({ can_update: true });
    relaunchMock.mockResolvedValue(undefined);

    const { downloadAndInstallUpdate } = await import('@/lib/update-commands');
    await downloadAndInstallUpdate(onProgress);

    expect(onProgress).toHaveBeenCalledWith(500, 1000);
    expect(onProgress).toHaveBeenCalledWith(1000, 1000);
  });

  it('uses the same channel target for checking and installing the offered update', async () => {
    const update = makeUpdate({ version: '2.1.0-beta.2' });
    checkMock.mockResolvedValue(update);
    getAppSettingsMock.mockResolvedValue({ updateChannel: 'beta' });
    tauriInvokeMock.mockResolvedValue({ can_update: true });
    relaunchMock.mockResolvedValue(undefined);

    const { checkForUpdates, downloadAndInstallUpdate } = await import('@/lib/update-commands');
    await checkForUpdates();
    await downloadAndInstallUpdate();

    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(checkMock).toHaveBeenCalledWith({ target: 'beta-darwin-aarch64' });
    expect(update.download).toHaveBeenCalled();
    expect(update.install).toHaveBeenCalled();
  });

  it('does not install a beta update after the channel changes during download', async () => {
    let finishDownload!: () => void;
    const downloadFinished = new Promise<void>((resolve) => {
      finishDownload = resolve;
    });
    const update = {
      ...makeUpdate(),
      download: vi.fn().mockImplementation(() => downloadFinished),
    };
    getAppSettingsMock.mockResolvedValue({ updateChannel: 'beta' });
    checkMock.mockResolvedValue(update);
    tauriInvokeMock.mockResolvedValue({ can_update: true });

    const { checkForUpdates, clearPendingUpdate, downloadAndInstallUpdate } =
      await import('@/lib/update-commands');
    await checkForUpdates();
    const downloadPromise = downloadAndInstallUpdate();
    await vi.waitFor(() => expect(update.download).toHaveBeenCalledTimes(1));

    clearPendingUpdate();
    getAppSettingsMock.mockResolvedValue({ updateChannel: 'stable' });
    finishDownload();

    await expect(downloadPromise).rejects.toThrow('Update channel changed');
    expect(update.install).not.toHaveBeenCalled();
    expect(update.close).toHaveBeenCalledTimes(1);
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it('invalidates a pending candidate when the channel is switched', async () => {
    const update = makeUpdate();
    checkMock.mockResolvedValueOnce(update).mockResolvedValueOnce(null);
    const { checkForUpdates, clearPendingUpdate, downloadAndInstallUpdate } =
      await import('@/lib/update-commands');
    await checkForUpdates();
    clearPendingUpdate();
    getAppSettingsMock.mockResolvedValue({ updateChannel: 'beta' });

    await expect(downloadAndInstallUpdate()).rejects.toThrow('No update available');
    expect(update.download).not.toHaveBeenCalled();
    expect(update.install).not.toHaveBeenCalled();
    expect(checkMock).toHaveBeenLastCalledWith({ target: 'beta-darwin-aarch64' });
  });
});
