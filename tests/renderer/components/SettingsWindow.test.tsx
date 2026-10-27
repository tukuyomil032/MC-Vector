import { useI18nStore } from '@/i18n';
import SettingsWindow from '@/renderer/components/SettingsWindow';
import type { AppUpdaterSettings } from '@/renderer/hooks/use-app-updater';
import { useSettingsStore } from '@/store/settingsStore';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveAppSettingsMock, onCheckForUpdatesMock, logErrorMock } = vi.hoisted(() => ({
  saveAppSettingsMock: vi.fn(),
  onCheckForUpdatesMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock('@/lib/config-commands', () => ({ saveAppSettings: saveAppSettingsMock }));

vi.mock('@/lib/error-utils', () => ({ logError: logErrorMock }));

const defaultProps: AppUpdaterSettings = {
  onCheckForUpdates: onCheckForUpdatesMock,
  updateCheckStatus: 'idle',
  updateCheckError: null,
  updatePrompt: null,
  updateProgress: null,
};

function renderSettings(props: Partial<typeof defaultProps> = {}) {
  return render(<SettingsWindow {...defaultProps} {...props} />);
}

describe('SettingsWindow plugin download security setting', () => {
  beforeEach(() => {
    saveAppSettingsMock.mockReset().mockResolvedValue(undefined);
    onCheckForUpdatesMock.mockReset().mockResolvedValue(undefined);
    logErrorMock.mockReset();
    useI18nStore.setState({ currentLocale: 'en' });
    useSettingsStore.setState({ allowUnverifiedPluginDownloads: false });
    useSettingsStore.setState({ updateChannel: 'stable' });
  });

  it('renders the hashless-download option disabled by default with an accessible warning', () => {
    renderSettings();

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
    renderSettings();

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

  it('uses the shared updater check action from Settings', () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }));

    expect(onCheckForUpdatesMock).toHaveBeenCalledTimes(1);
  });

  it('shows no-update and check-error states from the shared updater', () => {
    const { rerender } = renderSettings({ updateCheckStatus: 'not-available' });

    expect(screen.getByText('You are up to date.')).toBeInTheDocument();

    rerender(
      <SettingsWindow
        {...defaultProps}
        updateCheckStatus="error"
        updateCheckError="Feed unavailable"
      />,
    );

    expect(screen.getByText('Error: Feed unavailable')).toBeInTheDocument();
  });

  it('persists the selected update channel and dispatches one shared check event', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    renderSettings();

    const selector = screen.getByRole('combobox', { name: 'Update channel' });
    fireEvent.change(selector, { target: { value: 'beta' } });

    await waitFor(() => expect(selector).toHaveValue('beta'));
    expect(saveAppSettingsMock).toHaveBeenCalledWith({ updateChannel: 'beta' });
    await waitFor(() => {
      expect(
        dispatchSpy.mock.calls.filter(
          ([event]) => event.type === 'mc-vector:update-channel-changed',
        ),
      ).toHaveLength(1);
    });
    expect(onCheckForUpdatesMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('Receive prerelease builds for early access to upcoming changes.'),
    ).toBeInTheDocument();
    dispatchSpy.mockRestore();
  });

  it('shows the available version and leaves download handling to the shared modal', () => {
    renderSettings({
      updateCheckStatus: 'available',
      updatePrompt: { version: '2.0.64-beta.1', releaseNotes: '## v2.0.64-beta.1' },
    });

    expect(screen.getByTestId('update-status-version')).toHaveAttribute(
      'data-version',
      '2.0.64-beta.1',
    );
    expect(screen.queryByTestId('update-download-button')).not.toBeInTheDocument();
  });

  it('disables channel selection while the shared update is downloading', () => {
    renderSettings({ updateProgress: 25 });

    expect(screen.getByRole('combobox', { name: 'Update channel' })).toBeDisabled();
  });
});
