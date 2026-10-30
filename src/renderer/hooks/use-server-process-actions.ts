import { useCallback, useRef } from 'react';
import type { Translate } from '../../i18n';
import { logError } from '../../lib/error-utils';
import { isEulaRequiredError } from '../../lib/eula-commands';
import {
  isServerRunning,
  restartServer as restartServerApi,
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

  const runServerActionWithEula = useCallback(
    async (
      server: MinecraftServer,
      action: (serverId: string) => Promise<void>,
      onReady: () => void,
      retryAction: (serverId: string) => Promise<void> = action,
    ): Promise<EulaGateResult> => {
      return runExclusiveServerStart(server.id, async () => {
        const gateResult = await ensureServerEula(server, 'interactive');
        if (gateResult !== 'accepted') {
          return gateResult;
        }

        try {
          onReady();
          await action(server.id);
        } catch (error) {
          if (!isEulaRequiredError(error)) {
            throw error;
          }

          const retryGateResult = await ensureServerEula(server, 'interactive');
          if (retryGateResult !== 'accepted') {
            return retryGateResult;
          }
          onReady();
          await retryAction(server.id);
        }

        return 'accepted';
      });
    },
    [ensureServerEula],
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
      const gateResult = await runServerActionWithEula(activeServer, startServerApi, () => {
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
    runServerActionWithEula,
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
    let restartRequested = false;

    try {
      const gateResult = await runServerActionWithEula(
        activeServer,
        restartServerApi,
        () => {
          if (!restartRequested) {
            restartRequested = true;
            markExpectedOffline(serverId);
            clearAutoRestartTimer(serverId);
          }
          setServers((prev) =>
            prev.map((server) =>
              server.id === serverId ? { ...server, status: 'restarting' } : server,
            ),
          );
        },
        async (id) => {
          if (await isServerRunning(id)) {
            await restartServerApi(id);
          } else {
            await startServerApi(id);
          }
        },
      );
      if (gateResult !== 'accepted' && restartRequested) {
        const fallbackStatus = await resolveStatusAfterStopPhaseFailure(serverId);
        setServers((prev) =>
          prev.map((server) =>
            server.id === serverId ? { ...server, status: fallbackStatus } : server,
          ),
        );
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
    runServerActionWithEula,
    t,
  ]);

  return {
    handleStart,
    handleStop,
    handleRestart,
  };
}
