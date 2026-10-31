import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import ServerSettings from '@/renderer/components/properties/ServerSettings';
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

function renderSettings(overrides: Partial<MinecraftServer> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ServerSettings
      server={{ ...server, ...overrides }}
      onSave={onSave}
      onServerVersionChanged={vi.fn()}
      onOpenNgrokGuide={vi.fn()}
    />,
  );
  return { ...view, onSave };
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
    renderSettings();

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
