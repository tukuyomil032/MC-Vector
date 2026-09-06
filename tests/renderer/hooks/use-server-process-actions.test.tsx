import type { Translate } from '@/i18n';
import type { EulaGateResult } from '@/renderer/hooks/use-server-eula-gate';
import { useServerProcessActions } from '@/renderer/hooks/use-server-process-actions';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isServerRunningMock, startServerMock, stopServerMock, isEulaRequiredErrorMock } =
  vi.hoisted(() => ({
    isServerRunningMock: vi.fn(),
    startServerMock: vi.fn(),
    stopServerMock: vi.fn(),
    isEulaRequiredErrorMock: vi.fn(),
  }));

vi.mock('@/lib/server-commands', () => ({
  isServerRunning: isServerRunningMock,
  startServer: startServerMock,
  stopServer: stopServerMock,
}));

vi.mock('@/lib/eula-commands', () => ({
  isEulaRequiredError: isEulaRequiredErrorMock,
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

const translate = ((key: string) => key) as Translate;

function ProcessActionsHarness({ gateResult = 'accepted' }: { gateResult?: EulaGateResult }) {
  const actions = useServerProcessActions({
    activeServer: server,
    selectedServerId: server.id,
    setServers: () => undefined,
    showToast: vi.fn(),
    t: translate,
    clearExpectedOffline: vi.fn(),
    resetAutoRestartState: vi.fn(),
    markExpectedOffline: vi.fn(),
    clearAutoRestartTimer: vi.fn(),
    ensureServerEula: async () => gateResult,
  });

  return (
    <button type="button" onClick={() => void actions.handleStart()}>
      Start server
    </button>
  );
}

describe('use-server-process-actions EULA integration', () => {
  beforeEach(() => {
    isServerRunningMock.mockReset();
    startServerMock.mockReset();
    stopServerMock.mockReset();
    isEulaRequiredErrorMock.mockReset();
    showToastMock.mockReset();
    isServerRunningMock.mockResolvedValue(false);
    startServerMock.mockResolvedValue(undefined);
    stopServerMock.mockResolvedValue(undefined);
    isEulaRequiredErrorMock.mockReturnValue(false);
  });

  it('starts exactly once after the EULA gate accepts', async () => {
    render(<ProcessActionsHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Start server' }));

    await waitFor(() => expect(startServerMock).toHaveBeenCalledTimes(1));
  });

  it('does not call start_server after EULA cancellation', async () => {
    render(<ProcessActionsHarness gateResult="cancelled" />);

    fireEvent.click(screen.getByRole('button', { name: 'Start server' }));

    await waitFor(() => expect(startServerMock).not.toHaveBeenCalled());
  });

  it('rechecks the EULA defense error without showing a generic start failure', async () => {
    const startError = new Error('[Tauri] start_server failed: eula-required');
    startServerMock.mockRejectedValueOnce(startError);
    isEulaRequiredErrorMock.mockReturnValue(true);
    let gateCall = 0;
    const ensureServerEula = async () => {
      gateCall += 1;
      return (gateCall === 1 ? 'accepted' : 'cancelled') as EulaGateResult;
    };

    function DefenseHarness() {
      const actions = useServerProcessActions({
        activeServer: server,
        selectedServerId: server.id,
        setServers: () => undefined,
        showToast: showToastMock,
        t: translate,
        clearExpectedOffline: vi.fn(),
        resetAutoRestartState: vi.fn(),
        markExpectedOffline: vi.fn(),
        clearAutoRestartTimer: vi.fn(),
        ensureServerEula,
      });
      return <button onClick={() => void actions.handleStart()}>Start server</button>;
    }

    render(<DefenseHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start server' }));

    await waitFor(() => expect(startServerMock).toHaveBeenCalledTimes(1));
    expect(showToastMock).not.toHaveBeenCalledWith('server.toast.startFailed', 'error');
  });
});

const showToastMock = vi.fn();
