import { useCallback, useRef } from 'react';
import type { Translate } from '../../i18n';
import { logError } from '../../lib/error-utils';
import { isEulaRequiredError } from '../../lib/eula-commands';
import {
  isServerRunning,
  startServer as startServerApi,
  stopServer as stopServerApi,
} from '../../lib/server-commands';
import type { MinecraftServer } from '../shared/server declaration';
import type { ToastKind } from '../shared/toast';
import {
  type EulaGateMode,
  type EulaGateResult,
  runExclusiveServerStart,
} from './use-server-eula-gate';
type SetServers = (
  nextServers: MinecraftServer[] | ((prevServers: MinecraftServer[]) => MinecraftServer[]),
) => void;

interface UseServerProcessActionsOptions {
  activeServer: MinecraftServer | undefined;
  selectedServerId: string;
  setServers: SetServers;
  showToast: (message: string, type?: ToastKind) => void;
  t: Translate;
  clearExpectedOffline: (serverId: string) => void;
  resetAutoRestartState: (serverId: string) => void;
  markExpectedOffline: (serverId: string) => void;
  clearAutoRestartTimer: (serverId: string) => void;
  ensureServerEula: (server: MinecraftServer, mode: EulaGateMode) => Promise<EulaGateResult>;
}

export function useServerProcessActions({
  activeServer,
  selectedServerId,
  setServers,
  showToast,
  t,
  clearExpectedOffline,
  resetAutoRestartState,
  markExpectedOffline,
  clearAutoRestartTimer,
  ensureServerEula,
}: UseServerProcessActionsOptions) {
  const startInFlightRef = useRef<string | null>(null);

  const startServerProcess = useCallback(async (server: MinecraftServer) => {
    const javaPath = server.javaPath || 'java';
    const jarFile = server.software === 'Forge' ? 'forge-server.jar' : 'server.jar';
    await startServerApi(server.id, javaPath, server.memory, jarFile, server.jvmArgs);
  }, []);

  const startServerProcessWithEula = useCallback(
    async (server: MinecraftServer, onReadyToStart: () => void): Promise<EulaGateResult> => {
      return runExclusiveServerStart(server.id, async () => {
        const gateResult = await ensureServerEula(server, 'interactive');
        if (gateResult !== 'accepted') {
          return gateResult;
        }

        try {
          onReadyToStart();
          await startServerProcess(server);
        } catch (error) {
          if (!isEulaRequiredError(error)) {
            throw error;
          }

          const retryGateResult = await ensureServerEula(server, 'interactive');
          if (retryGateResult !== 'accepted') {
            return retryGateResult;
          }
          onReadyToStart();
          await startServerProcess(server);
        }

        return 'accepted';
      });
    },
    [ensureServerEula, startServerProcess],
  );

  const resolveStatusAfterStopPhaseFailure = useCallback(
    async (serverId: string): Promise<MinecraftServer['status']> => {
      try {
        const running = await isServerRunning(serverId);
        if (running) {
          clearExpectedOffline(serverId);
          resetAutoRestartState(serverId);
          return 'online';
        }
      } catch (error) {
        logError('Failed to verify server state after stop phase failure', error, { serverId });
      }
      clearExpectedOffline(serverId);
      resetAutoRestartState(serverId);
      return 'offline';
    },
    [clearExpectedOffline, resetAutoRestartState],
  );

  const handleStart = useCallback(async () => {
    if (!activeServer) {
      showToast(t('server.toast.noServerSelected'), 'error');
      return;
    }

    const serverId = activeServer.id;
    if (startInFlightRef.current === serverId) {
      return;
    }
    startInFlightRef.current = serverId;
    clearExpectedOffline(serverId);
    resetAutoRestartState(serverId);

    try {
      const gateResult = await startServerProcessWithEula(activeServer, () => {
        setServers((prev) =>
          prev.map((server) =>
            server.id === serverId ? { ...server, status: 'starting' } : server,
          ),
        );
      });
      if (gateResult !== 'accepted') {
        setServers((prev) =>
          prev.map((server) =>
            server.id === serverId ? { ...server, status: 'offline' } : server,
          ),
        );
        return;
      }
    } catch (error) {
      logError('Start server failed', error, { serverId });
      setServers((prev) =>
        prev.map((server) => (server.id === serverId ? { ...server, status: 'offline' } : server)),
      );
      showToast(t('server.toast.startFailed'), 'error');
    } finally {
      if (startInFlightRef.current === serverId) {
        startInFlightRef.current = null;
      }
    }
  }, [
    activeServer,
    clearExpectedOffline,
    resetAutoRestartState,
    setServers,
    showToast,
    startServerProcessWithEula,
    t,
  ]);

  const handleStop = useCallback(async () => {
    if (!selectedServerId) {
      return;
    }

    markExpectedOffline(selectedServerId);
    clearAutoRestartTimer(selectedServerId);
    setServers((prev) =>
      prev.map((server) =>
        server.id === selectedServerId ? { ...server, status: 'stopping' } : server,
      ),
    );

    try {
      await stopServerApi(selectedServerId);
    } catch (error) {
      logError('Stop server failed', error, { serverId: selectedServerId });
      const fallbackStatus = await resolveStatusAfterStopPhaseFailure(selectedServerId);
      setServers((prev) =>
        prev.map((server) =>
          server.id === selectedServerId ? { ...server, status: fallbackStatus } : server,
        ),
      );
      showToast(t('server.toast.stopFailed'), 'error');
    }
  }, [
    clearAutoRestartTimer,
    markExpectedOffline,
    resolveStatusAfterStopPhaseFailure,
    selectedServerId,
    setServers,
    showToast,
    t,
  ]);

  const handleRestart = useCallback(async () => {
    if (!activeServer) {
      showToast(t('server.toast.noServerSelected'), 'error');
      return;
    }

    const serverId = activeServer.id;
    if (startInFlightRef.current === serverId) {
      return;
    }
    startInFlightRef.current = serverId;
    markExpectedOffline(serverId);
    clearAutoRestartTimer(serverId);
    setServers((prev) =>
      prev.map((server) => (server.id === serverId ? { ...server, status: 'restarting' } : server)),
    );

    try {
      await stopServerApi(serverId);

      const maxWait = 30;
      for (let index = 0; index < maxWait; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const running = await isServerRunning(serverId);
        if (!running) {
          break;
        }
      }

      const running = await isServerRunning(serverId);
      if (running) {
        throw new Error('Timed out waiting for server shutdown');
      }

      const gateResult = await startServerProcessWithEula(activeServer, () => {
        setServers((prev) =>
          prev.map((server) =>
            server.id === serverId ? { ...server, status: 'starting' } : server,
          ),
        );
      });
      if (gateResult !== 'accepted') {
        setServers((prev) =>
          prev.map((server) =>
            server.id === serverId ? { ...server, status: 'offline' } : server,
          ),
        );
        return;
      }
    } catch (error) {
      logError('Restart server failed', error, { serverId });
      const fallbackStatus = await resolveStatusAfterStopPhaseFailure(serverId);
      setServers((prev) =>
        prev.map((server) =>
          server.id === serverId ? { ...server, status: fallbackStatus } : server,
        ),
      );
      showToast(t('server.toast.restartFailed'), 'error');
    } finally {
      if (startInFlightRef.current === serverId) {
        startInFlightRef.current = null;
      }
    }
  }, [
    activeServer,
    clearAutoRestartTimer,
    markExpectedOffline,
    resolveStatusAfterStopPhaseFailure,
    setServers,
    showToast,
    startServerProcessWithEula,
    t,
  ]);

  return {
    handleStart,
    handleStop,
    handleRestart,
  };
}
