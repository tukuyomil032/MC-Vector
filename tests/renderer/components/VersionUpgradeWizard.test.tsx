import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: vi.fn(),
    warning: vi.fn(),
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
    expect(executeServerJarInstallMock).not.toHaveBeenCalled();
  });
});
