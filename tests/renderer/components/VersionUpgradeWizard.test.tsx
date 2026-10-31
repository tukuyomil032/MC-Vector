import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import VersionUpgradeWizard from '@/renderer/components/VersionUpgradeWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createBackupMock,
  executeServerJarInstallMock,
  onBackupProgressMock,
  onDownloadProgressMock,
  prepareServerJarInstallMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  createBackupMock: vi.fn(),
  executeServerJarInstallMock: vi.fn(),
  onBackupProgressMock: vi.fn(),
  onDownloadProgressMock: vi.fn(),
  prepareServerJarInstallMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@/renderer/shared/notify', () => ({
  notify: {
    error: toastErrorMock,
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/lib/backup-commands', () => ({
  createBackup: createBackupMock,
  onBackupProgress: onBackupProgressMock,
}));
vi.mock('@/lib/server-commands', () => ({
  executeServerJarInstall: executeServerJarInstallMock,
  onDownloadProgress: onDownloadProgressMock,
  prepareServerJarInstall: prepareServerJarInstallMock,
}));

const server = {
  id: 'server-a',
  name: 'Server A',
  version: '1.21',
  software: 'Paper',
  port: 25565,
  memory: 2048,
  path: '/servers/server-a',
  status: 'offline',
} as MinecraftServer;

// Arc dialogs and motion mount slowly in jsdom, and the full suite runs in parallel, so allow more time per test.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  createBackupMock.mockReset().mockResolvedValue({
    status: 'created',
    backupName: 'pre-upgrade.zip',
    catalogError: null,
    restart: { status: 'not_needed' },
  });
  toastErrorMock.mockReset();
  executeServerJarInstallMock
    .mockReset()
    .mockResolvedValue({ serverId: server.id, version: '1.22' });
  onBackupProgressMock.mockReset().mockResolvedValue(() => {});
  onDownloadProgressMock.mockReset().mockResolvedValue(() => {});
  prepareServerJarInstallMock.mockReset().mockResolvedValue({
    planId: 'one-use-plan',
    latestVersion: '1.22',
    verified: true,
  });
});

describe('VersionUpgradeWizard Rust-owned install flow', () => {
  it('executes the prepared plan and reports only the version to local UI state', async () => {
    const onServerVersionChanged = vi.fn();
    render(
      <VersionUpgradeWizard
        server={server}
        onClose={vi.fn()}
        onServerVersionChanged={onServerVersionChanged}
      />,
    );

    await waitFor(() =>
      expect(prepareServerJarInstallMock).toHaveBeenCalledWith(server.id, 'Paper', server.version),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.startUpgrade' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.runBackup' }),
    );
    await waitFor(() => expect(createBackupMock).toHaveBeenCalledOnce());
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.runDownload' }),
    );

    await waitFor(() => expect(executeServerJarInstallMock).toHaveBeenCalledWith('one-use-plan'));
    expect(onServerVersionChanged).toHaveBeenCalledWith('1.22');
    expect(onServerVersionChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps download disabled when the resolved artifact has no checksum', async () => {
    prepareServerJarInstallMock.mockResolvedValueOnce({
      planId: 'unverified-plan',
      latestVersion: '1.22',
      verified: false,
    });
    render(
      <VersionUpgradeWizard server={server} onClose={vi.fn()} onServerVersionChanged={vi.fn()} />,
    );

    await waitFor(() => expect(prepareServerJarInstallMock).toHaveBeenCalledOnce());
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.startUpgrade' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.runBackup' }),
    );
    await waitFor(() => expect(createBackupMock).toHaveBeenCalledOnce());
    expect(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.runDownload' }),
    ).toBeDisabled();
    expect(screen.getByText('serverSettings.versionUpgrade.unverifiedReason')).toBeInTheDocument();
    expect(executeServerJarInstallMock).not.toHaveBeenCalled();
  });

  it('does not advance if the server became running before the upgrade backup', async () => {
    createBackupMock.mockResolvedValueOnce({ status: 'confirmation_required' });
    render(
      <VersionUpgradeWizard server={server} onClose={vi.fn()} onServerVersionChanged={vi.fn()} />,
    );

    await waitFor(() => expect(prepareServerJarInstallMock).toHaveBeenCalledOnce());
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.startUpgrade' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.runBackup' }),
    );

    await waitFor(() => expect(createBackupMock).toHaveBeenCalledOnce());
    expect(createBackupMock).toHaveBeenCalledWith(
      server.id,
      expect.stringMatching(/^pre-upgrade-/),
      undefined,
      false,
    );
    expect(
      screen.queryByRole('button', { name: 'serverSettings.versionUpgrade.runDownload' }),
    ).not.toBeInTheDocument();
    expect(executeServerJarInstallMock).not.toHaveBeenCalled();
  });

  it('shows backup progress on the 0-100 scale the backend reports', async () => {
    let emitBackupProgress: ((data: { serverId: string; progress: number }) => void) | undefined;
    onBackupProgressMock.mockImplementationOnce(async (callback) => {
      emitBackupProgress = callback;
      return () => {};
    });
    let finishBackup: ((value: unknown) => void) | undefined;
    createBackupMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finishBackup = resolve;
      }),
    );
    render(
      <VersionUpgradeWizard server={server} onClose={vi.fn()} onServerVersionChanged={vi.fn()} />,
    );

    await waitFor(() => expect(prepareServerJarInstallMock).toHaveBeenCalledOnce());
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.startUpgrade' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.runBackup' }),
    );
    await waitFor(() => expect(emitBackupProgress).toBeDefined());

    act(() => emitBackupProgress?.({ serverId: server.id, progress: 42 }));

    const bar = screen.getByRole('progressbar', {
      name: 'serverSettings.versionUpgrade.backupProgressLabel',
    });
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    finishBackup?.({ status: 'created', backupName: 'pre-upgrade.zip', catalogError: null });
  });

  it('keeps the wizard open while a backup runs and explains why', async () => {
    let finishBackup: ((value: unknown) => void) | undefined;
    createBackupMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finishBackup = resolve;
      }),
    );
    const onClose = vi.fn();
    render(
      <VersionUpgradeWizard server={server} onClose={onClose} onServerVersionChanged={vi.fn()} />,
    );

    await waitFor(() => expect(prepareServerJarInstallMock).toHaveBeenCalledOnce());
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.startUpgrade' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.runBackup' }),
    );
    await waitFor(() => expect(createBackupMock).toHaveBeenCalledOnce());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText('serverSettings.versionUpgrade.blockedWhileRunning'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.close' }),
    ).toBeDisabled();
    finishBackup?.({
      status: 'created',
      backupName: 'pre-upgrade.zip',
      catalogError: null,
      restart: { status: 'not_needed' },
    });
  });

  it('reports backup and restart failure together without claiming the backup was created', async () => {
    createBackupMock.mockResolvedValueOnce({
      status: 'failed',
      stage: 'backup',
      error: 'archive write failed',
      restartError: 'process start failed',
    });
    render(
      <VersionUpgradeWizard server={server} onClose={vi.fn()} onServerVersionChanged={vi.fn()} />,
    );

    await waitFor(() => expect(prepareServerJarInstallMock).toHaveBeenCalledOnce());
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.startUpgrade' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.versionUpgrade.runBackup' }),
    );

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('backups.toast.backupNotCreatedRestartFailed'),
    );
    expect(toastErrorMock).not.toHaveBeenCalledWith('serverSettings.versionUpgrade.backupFailed');
    expect(
      screen.queryByRole('button', { name: 'serverSettings.versionUpgrade.runDownload' }),
    ).not.toBeInTheDocument();
    expect(executeServerJarInstallMock).not.toHaveBeenCalled();
  });
});
