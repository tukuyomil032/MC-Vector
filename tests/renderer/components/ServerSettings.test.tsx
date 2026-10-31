import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import ServerSettings from '@/renderer/components/properties/ServerSettings';
import { hasUnsavedViewChanges } from '@/renderer/components/properties/use-unsaved-changes-guard';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  clearNgrokTokenMock,
  hasNgrokTokenMock,
  setNgrokTokenMock,
  startNgrokMock,
  stopNgrokMock,
  getJavaVersionsMock,
} = vi.hoisted(() => ({
  clearNgrokTokenMock: vi.fn(),
  hasNgrokTokenMock: vi.fn(),
  setNgrokTokenMock: vi.fn(),
  startNgrokMock: vi.fn(),
  stopNgrokMock: vi.fn(),
  getJavaVersionsMock: vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/lib/ngrok-commands', () => ({
  clearNgrokToken: clearNgrokTokenMock,
  hasNgrokToken: hasNgrokTokenMock,
  onNgrokStatusChange: vi.fn().mockResolvedValue(() => {}),
  setNgrokToken: setNgrokTokenMock,
  startNgrok: startNgrokMock,
  stopNgrok: stopNgrokMock,
}));
vi.mock('@/lib/java-commands', () => ({
  getJavaVersions: getJavaVersionsMock,
}));
vi.mock('@/lib/clipboard-commands', () => ({
  copyToClipboard: vi.fn(),
}));
vi.mock('@/renderer/shared/notify', () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/renderer/components/JavaManagerModal', () => ({
  default: () => null,
}));
vi.mock('@/renderer/components/VersionUpgradeWizard', () => ({
  default: () => null,
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

function settingsElement(current: MinecraftServer, onSave = vi.fn().mockResolvedValue(undefined)) {
  return (
    <ServerSettings
      server={current}
      onSave={onSave}
      onServerVersionChanged={vi.fn()}
      onOpenNgrokGuide={vi.fn()}
    />
  );
}

beforeEach(() => {
  clearNgrokTokenMock.mockReset().mockResolvedValue(undefined);
  hasNgrokTokenMock.mockReset().mockResolvedValue(true);
  setNgrokTokenMock.mockReset().mockResolvedValue(undefined);
  startNgrokMock.mockReset().mockResolvedValue(undefined);
  stopNgrokMock.mockReset().mockResolvedValue(undefined);
  getJavaVersionsMock.mockReset().mockResolvedValue([]);
});

describe('ServerSettings ngrok token', () => {
  it('keeps the stored token when the change-token dialog is cancelled', async () => {
    render(settingsElement(server));

    fireEvent.click(
      await screen.findByRole('button', { name: 'serverSettings.ngrok.changeToken' }),
    );
    expect(await screen.findByText('serverSettings.ngrok.tokenRequired.title')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'serverSettings.ngrok.tokenRequired.cancel' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText('serverSettings.ngrok.tokenRequired.title'),
      ).not.toBeInTheDocument(),
    );
    expect(clearNgrokTokenMock).not.toHaveBeenCalled();
    expect(setNgrokTokenMock).not.toHaveBeenCalled();
  });
});

describe('ServerSettings edits across server updates', () => {
  it('keeps an unsaved name when the server status changes', () => {
    const { rerender } = render(settingsElement(server));
    const nameInput = screen.getByTestId('server-settings-name-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Edited name' } });

    rerender(settingsElement({ ...server, status: 'online' }));

    expect(nameInput).toHaveValue('Edited name');
  });

  it('follows a server port change when the port field was not edited', () => {
    const { rerender } = render(settingsElement(server));

    rerender(settingsElement({ ...server, port: 25600 }));

    expect(screen.getByLabelText('serverSettings.port')).toHaveValue('25600');
  });

  it('keeps an edited port when the saved server port changes underneath it', () => {
    const { rerender } = render(settingsElement(server));
    const portInput = screen.getByLabelText('serverSettings.port');
    fireEvent.change(portInput, { target: { value: '25700' } });
    // NumberField commits a typed value on blur or Enter.
    fireEvent.blur(portInput);

    rerender(settingsElement({ ...server, port: 25600 }));

    expect(screen.getByLabelText('serverSettings.port')).toHaveValue('25700');
  });
});

describe('ServerSettings unsaved changes', () => {
  it('enables save only after a field differs from the saved server, and guards the window', () => {
    render(settingsElement(server));
    const save = screen.getByTestId('server-settings-save-button');
    expect(save).toBeDisabled();
    expect(hasUnsavedViewChanges()).toBe(false);

    fireEvent.change(screen.getByTestId('server-settings-name-input'), {
      target: { value: 'Renamed' },
    });

    expect(save).toBeEnabled();
    expect(screen.getByText('serverSettings.unsavedChanges')).toBeInTheDocument();
    expect(hasUnsavedViewChanges()).toBe(true);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('ServerSettings auto restart and auto backup fields', () => {
  it('disables the restart limits while auto restart is off, and enables them when it is switched on', () => {
    render(settingsElement({ ...server, autoRestartOnCrash: false }));
    const retries = screen.getByLabelText('serverSettings.autoRestart.maxRetries');
    const delay = screen.getByLabelText('serverSettings.autoRestart.delaySeconds');
    expect(retries).toBeDisabled();
    expect(delay).toBeDisabled();

    fireEvent.click(screen.getByTestId('auto-restart-toggle'));

    expect(retries).not.toBeDisabled();
    expect(delay).not.toBeDisabled();
  });

  it('disables the backup schedule fields while auto backup is off', () => {
    render(settingsElement({ ...server, autoBackupEnabled: false }));

    expect(screen.getByLabelText('serverSettings.autoBackup.intervalMinutes')).toBeDisabled();
    expect(screen.getByLabelText('serverSettings.autoBackup.retainCount')).toBeDisabled();
    expect(screen.getByLabelText('serverSettings.autoBackup.retainDays')).toBeDisabled();
  });
});
