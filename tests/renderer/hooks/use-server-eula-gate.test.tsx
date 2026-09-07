import { useI18nStore } from '@/i18n';
import ServerEulaModal from '@/renderer/components/ServerEulaModal';
import { type EulaGateMode, useServerEulaGate } from '@/renderer/hooks/use-server-eula-gate';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerEulaStatusMock, acceptServerEulaMock } = vi.hoisted(() => ({
  getServerEulaStatusMock: vi.fn(),
  acceptServerEulaMock: vi.fn(),
}));

vi.mock('@/lib/eula-commands', () => ({
  getServerEulaStatus: getServerEulaStatusMock,
  acceptServerEula: acceptServerEulaMock,
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

const server: MinecraftServer = {
  id: 'server-1',
  name: 'Test Server',
  version: '1.21.10',
  software: 'Paper',
  port: 25565,
  memory: 2048,
  path: '/mock/app-data/servers/server-1',
  status: 'offline',
  createdDate: '2026-01-01T00:00:00.000Z',
};

function EulaGateHarness({ mode = 'interactive' }: { mode?: EulaGateMode }) {
  const { pendingEula, ensureServerEula, acceptPendingEula, cancelPendingEula } =
    useServerEulaGate();

  return (
    <>
      <button
        type="button"
        data-testid="request-eula"
        onClick={() => {
          void ensureServerEula(server, mode).then((result) => {
            const element = document.querySelector('[data-testid="gate-result"]');
            if (element) element.textContent = result;
          });
        }}
      >
        Request EULA
      </button>
      <button type="button" data-testid="accept-pending" onClick={() => void acceptPendingEula()}>
        Accept pending EULA
      </button>
      <button type="button" data-testid="cancel-pending" onClick={cancelPendingEula}>
        Cancel pending EULA
      </button>
      <output data-testid="gate-result" />
      <ServerEulaModal
        pending={pendingEula}
        onAccept={acceptPendingEula}
        onCancel={cancelPendingEula}
      />
    </>
  );
}

describe('use-server-eula-gate', () => {
  beforeEach(() => {
    getServerEulaStatusMock.mockReset();
    acceptServerEulaMock.mockReset();
    getServerEulaStatusMock.mockResolvedValue({ accepted: false, fileExists: false });
    acceptServerEulaMock.mockResolvedValue(undefined);
    useI18nStore.setState({ currentLocale: 'en' });
  });

  it('passes through immediately when the server EULA is already accepted', async () => {
    getServerEulaStatusMock.mockResolvedValueOnce({ accepted: true, fileExists: true });
    render(<EulaGateHarness />);

    fireEvent.click(screen.getByTestId('request-eula'));

    await waitFor(() => expect(screen.getByTestId('gate-result')).toHaveTextContent('accepted'));
    expect(screen.queryByTestId('server-eula-modal')).not.toBeInTheDocument();
  });

  it('keeps an interactive request pending until the checkbox is accepted', async () => {
    render(<EulaGateHarness />);

    fireEvent.click(screen.getByTestId('request-eula'));
    const modal = await screen.findByTestId('server-eula-modal');
    expect(modal).toBeVisible();

    const acceptButton = screen.getByTestId('server-eula-accept');
    expect(acceptButton).toBeDisabled();
    fireEvent.click(screen.getByTestId('server-eula-checkbox'));
    expect(acceptButton).toBeEnabled();

    fireEvent.click(acceptButton);
    await waitFor(() => expect(acceptServerEulaMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('server-eula-modal')).not.toBeInTheDocument());
    expect(screen.getByTestId('gate-result')).toHaveTextContent('accepted');
  });

  it('does not create a second modal for duplicate requests to the same server', async () => {
    render(<EulaGateHarness />);

    fireEvent.click(screen.getByTestId('request-eula'));
    fireEvent.click(screen.getByTestId('request-eula'));

    await screen.findByTestId('server-eula-modal');
    expect(screen.getAllByTestId('server-eula-modal')).toHaveLength(1);
    expect(getServerEulaStatusMock).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending request without accepting the EULA', async () => {
    render(<EulaGateHarness />);

    fireEvent.click(screen.getByTestId('request-eula'));
    await screen.findByTestId('server-eula-modal');
    fireEvent.click(screen.getByTestId('server-eula-cancel'));

    await waitFor(() => expect(screen.getByTestId('gate-result')).toHaveTextContent('cancelled'));
    expect(acceptServerEulaMock).not.toHaveBeenCalled();
  });

  it('keeps the request and displays an inline error when writing the EULA fails', async () => {
    acceptServerEulaMock.mockRejectedValueOnce(new Error('disk full'));
    render(<EulaGateHarness />);

    fireEvent.click(screen.getByTestId('request-eula'));
    await screen.findByTestId('server-eula-modal');
    fireEvent.click(screen.getByTestId('server-eula-checkbox'));
    fireEvent.click(screen.getByTestId('server-eula-accept'));

    await waitFor(() =>
      expect(screen.getByTestId('server-eula-error')).toHaveTextContent('disk full'),
    );
    expect(screen.getByTestId('server-eula-modal')).toBeVisible();
    expect(screen.getByTestId('gate-result')).toHaveTextContent('');
  });

  it('blocks background requests without showing a modal', async () => {
    render(<EulaGateHarness mode="background" />);

    fireEvent.click(screen.getByTestId('request-eula'));

    await waitFor(() => expect(screen.getByTestId('gate-result')).toHaveTextContent('blocked'));
    expect(screen.queryByTestId('server-eula-modal')).not.toBeInTheDocument();
    expect(acceptServerEulaMock).not.toHaveBeenCalled();
  });
});
