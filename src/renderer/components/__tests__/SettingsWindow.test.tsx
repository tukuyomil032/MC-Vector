import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useI18nStore } from '../../../i18n';
import { useSettingsStore } from '../../../store/settingsStore';
import SettingsWindow from '../SettingsWindow';

const { saveAppSettingsMock } = vi.hoisted(() => ({
  saveAppSettingsMock: vi.fn(),
}));

vi.mock('../../../lib/config-commands', () => ({
  saveAppSettings: saveAppSettingsMock,
}));

vi.mock('../../../lib/update-commands', () => ({
  checkForUpdates: vi.fn(),
  downloadAndInstallUpdate: vi.fn(),
}));

vi.mock('../../../lib/error-utils', () => ({
  logError: vi.fn(),
}));

describe('SettingsWindow plugin download security setting', () => {
  beforeEach(() => {
    saveAppSettingsMock.mockReset();
    saveAppSettingsMock.mockResolvedValue(undefined);
    useI18nStore.setState({ currentLocale: 'en' });
    useSettingsStore.setState({ allowUnverifiedPluginDownloads: false });
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
});
