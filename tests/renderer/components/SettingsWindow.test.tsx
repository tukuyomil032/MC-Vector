import { useI18nStore } from '@/i18n';
import SettingsWindow from '@/renderer/components/SettingsWindow';
import { useSettingsStore } from '@/store/settingsStore';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  saveAppSettingsMock,
  checkForUpdatesMock,
  downloadAndInstallUpdateMock,
  clearPendingUpdateMock,
} = vi.hoisted(() => ({
  saveAppSettingsMock: vi.fn(),
  checkForUpdatesMock: vi.fn(),
  downloadAndInstallUpdateMock: vi.fn(),
  clearPendingUpdateMock: vi.fn(),
}));

vi.mock('@/lib/config-commands', () => ({
  saveAppSettings: saveAppSettingsMock,
}));

vi.mock('@/lib/update-commands', () => ({
  checkForUpdates: checkForUpdatesMock,
  downloadAndInstallUpdate: downloadAndInstallUpdateMock,
  clearPendingUpdate: clearPendingUpdateMock,
}));

vi.mock('@/lib/error-utils', () => ({
  logError: vi.fn(),
}));

describe('SettingsWindow plugin download security setting', () => {
  beforeEach(() => {
    saveAppSettingsMock.mockReset();
    saveAppSettingsMock.mockResolvedValue(undefined);
    checkForUpdatesMock.mockReset().mockResolvedValue({ available: false });
    downloadAndInstallUpdateMock.mockReset();
    clearPendingUpdateMock.mockReset();
    useI18nStore.setState({ currentLocale: 'en' });
    useSettingsStore.setState({ allowUnverifiedPluginDownloads: false });
    useSettingsStore.setState({ updateChannel: 'stable' });
  });

  it('renders the hashless-download option disabled by default with an accessible warning', () => {
    render(<SettingsWindow />);

    const checkbox = screen.getByRole('checkbox', {
      name: 'Allow unverified plugin downloads',
    });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveAttribute(
      'aria-describedby',
      'allow-unverified-plugin-downloads-warning',
    );
    expect(screen.getByText(/Warning: Enabling this allows plugin downloads/i)).toBeInTheDocument();
  });

  it('persists a toggle and rolls back with an inline error when saving fails', async () => {
    saveAppSettingsMock.mockRejectedValueOnce(new Error('store unavailable'));
    render(<SettingsWindow />);

    const checkbox = screen.getByRole('checkbox', {
      name: 'Allow unverified plugin downloads',
    });
    fireEvent.click(checkbox);

    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(saveAppSettingsMock).toHaveBeenCalledWith({
      allowUnverifiedPluginDownloads: true,
    });
    expect(screen.getByRole('alert')).toHaveTextContent('change was reverted');
  });

  it('persists the selected update channel and refreshes the candidate', async () => {
    render(<SettingsWindow />);

    const selector = screen.getByRole('combobox', { name: 'Update channel' });
    fireEvent.change(selector, { target: { value: 'beta' } });

    await waitFor(() => expect(selector).toHaveValue('beta'));
    expect(saveAppSettingsMock).toHaveBeenCalledWith({ updateChannel: 'beta' });
    expect(checkForUpdatesMock).toHaveBeenCalled();
    expect(clearPendingUpdateMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('Receive prerelease builds for early access to upcoming changes.'),
    ).toBeInTheDocument();
  });

  it('disables channel selection while an update is downloading', async () => {
    let failDownload!: (error: Error) => void;
    downloadAndInstallUpdateMock.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        failDownload = reject;
      }),
    );
    checkForUpdatesMock.mockResolvedValue({ available: true, version: '2.0.64-beta.1' });
    render(<SettingsWindow />);

    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }));
    const downloadButton = await screen.findByRole('button', { name: 'Download' });
    fireEvent.click(downloadButton);

    const selector = screen.getByRole('combobox', { name: 'Update channel' });
    await waitFor(() => expect(selector).toBeDisabled());

    failDownload(new Error('test download failure'));
    await waitFor(() => expect(selector).toBeEnabled());
  });
});
