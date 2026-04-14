import { useCallback, useEffect, useRef } from 'react';
import { createBackup } from '../../lib/backup-commands';
import { isServerRunning, startServer as startServerApi } from '../../lib/server-commands';
import type { ToastKind } from '../components/ToastProvider';
import type { MinecraftServer } from '../shared/server declaration';
import {
  buildAutoBackupName,
  buildTimeBasedAutoBackupKey,
  resolveAutoBackupScheduleType,
} from '../shared/auto-backup';

type Translate = (key: string, values?: Record<string, unknown>) => string;
type SetServers = (
  nextServers: MinecraftServer[] | ((prevServers: MinecraftServer[]) => MinecraftServer[]),
) => void;

interface UseServerAutomationOptions {
  servers: MinecraftServer[];
  setServers: SetServers;
  showToast: (message: string, type?: ToastKind) => void;
  t: Translate;
}

interface ServerStatusChangeData {
  serverId: string;
  status: MinecraftServer['status'];
}

export function useServerAutomation({
  servers,
  setServers,
  showToast,
  t,
}: UseServerAutomationOptions) {
  const serversRef = useRef<MinecraftServer[]>([]);
  const expectedOfflineEventsRef = useRef<Record<string, number>>({});
  const autoRestartAttemptsRef = useRef<Record<string, number>>({});
  const autoRestartTimerRef = useRef<Record<string, ReturnType<typeof window.setTimeout>>>({});
  const autoBackupIntervalRef = useRef<Record<string, ReturnType<typeof window.setInterval>>>({});
  const autoBackupRunningRef = useRef<Record<string, boolean>>({});
  const autoBackupLastRunKeyRef = useRef<Record<string, string>>({});

  const clearAutoRestartTimer = useCallback((serverId: string) => {
    const timerId = autoRestartTimerRef.current[serverId];
    if (timerId) {
      window.clearTimeout(timerId);
      delete autoRestartTimerRef.current[serverId];
    }
  }, []);

  const resetAutoRestartState = useCallback(
    (serverId: string) => {
      clearAutoRestartTimer(serverId);
      delete autoRestartAttemptsRef.current[serverId];
    },
    [clearAutoRestartTimer],
  );

  const markExpectedOffline = useCallback((serverId: string) => {
    expectedOfflineEventsRef.current[serverId] =
      (expectedOfflineEventsRef.current[serverId] ?? 0) + 1;
  }, []);

  const consumeExpectedOffline = useCallback((serverId: string): boolean => {
    const current = expectedOfflineEventsRef.current[serverId] ?? 0;
    if (current <= 0) {
      return false;
    }
    if (current === 1) {
      delete expectedOfflineEventsRef.current[serverId];
    } else {
      expectedOfflineEventsRef.current[serverId] = current - 1;
    }
    return true;
  }, []);

  const clearExpectedOffline = useCallback((serverId: string) => {
    delete expectedOfflineEventsRef.current[serverId];
  }, []);

  const clearAutoBackupInterval = useCallback(
    (serverId: string, options: { resetLastRunKey?: boolean } = {}) => {
      const intervalId = autoBackupIntervalRef.current[serverId];
      if (intervalId) {
        window.clearInterval(intervalId);
        delete autoBackupIntervalRef.current[serverId];
      }
      delete autoBackupRunningRef.current[serverId];
      if (options.resetLastRunKey) {
        delete autoBackupLastRunKeyRef.current[serverId];
      }
    },
    [],
  );

  const runAutoBackup = useCallback(
    async (serverId: string) => {
      if (autoBackupRunningRef.current[serverId]) {
        return;
      }

      const targetServer = serversRef.current.find((server) => server.id === serverId);
      if (!targetServer?.autoBackupEnabled || targetServer.status !== 'online') {
        return;
      }

      autoBackupRunningRef.current[serverId] = true;
      try {
        await createBackup(targetServer.path, buildAutoBackupName(targetServer));
        showToast(t('server.toast.autoBackupCreated', { name: targetServer.name }), 'success');
      } catch (error) {
        console.error('Auto backup failed:', error);
        showToast(t('server.toast.autoBackupFailed', { name: targetServer.name }), 'error');
      } finally {
        autoBackupRunningRef.current[serverId] = false;
      }
    },
    [showToast, t],
  );

  useEffect(() => {
    serversRef.current = servers;

    const activeServerIds = new Set(servers.map((server) => server.id));
    for (const serverId of Object.keys(autoRestartTimerRef.current)) {
      if (!activeServerIds.has(serverId)) {
        clearAutoRestartTimer(serverId);
      }
    }
    for (const serverId of Object.keys(autoRestartAttemptsRef.current)) {
      if (!activeServerIds.has(serverId)) {
        delete autoRestartAttemptsRef.current[serverId];
      }
    }
    for (const serverId of Object.keys(expectedOfflineEventsRef.current)) {
      if (!activeServerIds.has(serverId)) {
        delete expectedOfflineEventsRef.current[serverId];
      }
    }

    for (const serverId of Object.keys(autoBackupIntervalRef.current)) {
      if (!activeServerIds.has(serverId)) {
        clearAutoBackupInterval(serverId, { resetLastRunKey: true });
      }
    }

    for (const server of servers) {
      if (!server.autoBackupEnabled) {
        clearAutoBackupInterval(server.id, { resetLastRunKey: true });
        continue;
      }
      clearAutoBackupInterval(server.id);

      const scheduleType = resolveAutoBackupScheduleType(server);
      if (scheduleType === 'interval') {
        delete autoBackupLastRunKeyRef.current[server.id];
        const intervalMinutes = Math.min(
          1440,
          Math.max(1, Math.floor(server.autoBackupIntervalMin ?? 60)),
        );

        autoBackupIntervalRef.current[server.id] = window.setInterval(
          () => {
            void runAutoBackup(server.id);
          },
          intervalMinutes * 60 * 1000,
        );
        continue;
      }

      autoBackupIntervalRef.current[server.id] = window.setInterval(() => {
        const latestServer = serversRef.current.find((candidate) => candidate.id === server.id);
        if (!latestServer?.autoBackupEnabled || latestServer.status !== 'online') {
          return;
        }

        const triggerKey = buildTimeBasedAutoBackupKey(latestServer, new Date());
        if (!triggerKey) {
          return;
        }

        if (autoBackupLastRunKeyRef.current[server.id] === triggerKey) {
          return;
        }

        autoBackupLastRunKeyRef.current[server.id] = triggerKey;
        void runAutoBackup(server.id);
      }, 15 * 1000);
    }
  }, [clearAutoBackupInterval, clearAutoRestartTimer, runAutoBackup, servers]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(autoRestartTimerRef.current)) {
        window.clearTimeout(timerId);
      }
      autoRestartTimerRef.current = {};

      for (const intervalId of Object.values(autoBackupIntervalRef.current)) {
        window.clearInterval(intervalId);
      }
      autoBackupIntervalRef.current = {};
      autoBackupRunningRef.current = {};
      autoBackupLastRunKeyRef.current = {};
    };
  }, []);

  const handleServerStatusChange = useCallback(
    ({ serverId, status }: ServerStatusChangeData) => {
      const previousStatus = serversRef.current.find((server) => server.id === serverId)?.status;
      setServers((prev) =>
        prev.map((server) => (server.id === serverId ? { ...server, status } : server)),
      );

      if (status === 'online') {
        clearExpectedOffline(serverId);
        resetAutoRestartState(serverId);
        return;
      }

      if (status === 'offline' && consumeExpectedOffline(serverId)) {
        resetAutoRestartState(serverId);
        return;
      }

      if (status === 'offline' && previousStatus === 'offline') {
        resetAutoRestartState(serverId);
        return;
      }

      if (status !== 'crashed' && status !== 'offline') {
        return;
      }

      const targetServer = serversRef.current.find((server) => server.id === serverId);
      if (!targetServer?.autoRestartOnCrash) {
        resetAutoRestartState(serverId);
        return;
      }

      const maxAutoRestarts = Math.min(
        20,
        Math.max(0, Math.floor(targetServer.maxAutoRestarts ?? 3)),
      );
      const restartDelaySec = Math.min(
        300,
        Math.max(1, Math.floor(targetServer.autoRestartDelaySec ?? 5)),
      );

      if (maxAutoRestarts <= 0) {
        return;
      }

      const currentAttempt = autoRestartAttemptsRef.current[serverId] ?? 0;
      if (currentAttempt >= maxAutoRestarts) {
        showToast(t('server.toast.autoRestartLimitReached', { name: targetServer.name }), 'error');
        return;
      }

      const nextAttempt = currentAttempt + 1;
      autoRestartAttemptsRef.current[serverId] = nextAttempt;

      clearAutoRestartTimer(serverId);
      setServers((prev) =>
        prev.map((server) =>
          server.id === serverId ? { ...server, status: 'restarting' } : server,
        ),
      );
      showToast(
        t('server.toast.autoRestartScheduled', {
          name: targetServer.name,
          seconds: restartDelaySec,
          attempt: nextAttempt,
          max: maxAutoRestarts,
        }),
        'info',
      );

      autoRestartTimerRef.current[serverId] = window.setTimeout(async () => {
        clearAutoRestartTimer(serverId);

        const latestServer = serversRef.current.find((server) => server.id === serverId);
        if (!latestServer?.autoRestartOnCrash) {
          resetAutoRestartState(serverId);
          return;
        }

        try {
          const running = await isServerRunning(serverId);
          if (running) {
            resetAutoRestartState(serverId);
            return;
          }

          setServers((prev) =>
            prev.map((server) =>
              server.id === serverId ? { ...server, status: 'starting' } : server,
            ),
          );

          const javaPath = latestServer.javaPath || 'java';
          const jarFile = latestServer.software === 'Forge' ? 'forge-server.jar' : 'server.jar';
          await startServerApi(
            latestServer.id,
            javaPath,
            latestServer.path,
            latestServer.memory,
            jarFile,
          );
        } catch (error) {
          console.error('Auto restart failed:', error);
          setServers((prev) =>
            prev.map((server) =>
              server.id === serverId ? { ...server, status: 'offline' } : server,
            ),
          );
          showToast(
            t('server.toast.autoRestartTriggered', {
              name: latestServer.name,
              attempt: nextAttempt,
              max: maxAutoRestarts,
            }),
            'error',
          );
        }
      }, restartDelaySec * 1000);
    },
    [
      clearAutoRestartTimer,
      clearExpectedOffline,
      consumeExpectedOffline,
      resetAutoRestartState,
      setServers,
      showToast,
      t,
    ],
  );

  return {
    clearAutoRestartTimer,
    resetAutoRestartState,
    markExpectedOffline,
    clearExpectedOffline,
    handleServerStatusChange,
  };
}
