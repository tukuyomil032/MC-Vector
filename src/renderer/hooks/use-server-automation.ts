import { useCallback, useEffect, useRef } from 'react';
import { createBackup } from '../../lib/backup-commands';
import { isServerRunning, startServer as startServerApi } from '../../lib/server-commands';
import type { ToastKind } from '../components/ToastProvider';
import type { MinecraftServer } from '../shared/server declaration';
import {
  buildAutoBackupName,
  type AutoBackupScheduleType,
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

interface AutoRestartScheduleEntry {
  dueAt: number;
  attempt: number;
  maxAutoRestarts: number;
}

interface AutoBackupScheduleEntry {
  signature: string;
  scheduleType: AutoBackupScheduleType;
  intervalMinutes: number;
  nextRunAt: number;
}

interface AutoBackupTimeParts {
  hour: number;
  minute: number;
}

const AUTO_BACKUP_RETRY_DELAY_MS = 60_000;

function resolveAutoBackupTimeParts(server: MinecraftServer): AutoBackupTimeParts {
  const raw = typeof server.autoBackupTime === 'string' ? server.autoBackupTime.trim() : '';
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) {
    return { hour: 3, minute: 0 };
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function resolveAutoBackupWeekday(server: MinecraftServer): number {
  const raw =
    typeof server.autoBackupWeekday === 'number' && Number.isFinite(server.autoBackupWeekday)
      ? Math.floor(server.autoBackupWeekday)
      : 0;
  return Math.min(6, Math.max(0, raw));
}

function computeNextTimeBasedAutoBackupRunAt(
  server: MinecraftServer,
  from: Date,
  options: { allowCurrentMinute: boolean },
): number {
  const scheduleType = resolveAutoBackupScheduleType(server);
  const { hour, minute } = resolveAutoBackupTimeParts(server);
  const weekday = resolveAutoBackupWeekday(server);

  const currentMinuteMatches =
    from.getHours() === hour &&
    from.getMinutes() === minute &&
    (scheduleType === 'daily' || from.getDay() === weekday);
  if (options.allowCurrentMinute && currentMinuteMatches) {
    return from.getTime();
  }

  const nextRun = new Date(from);
  nextRun.setSeconds(0, 0);

  if (scheduleType === 'weekly') {
    const dayOffset = (weekday - from.getDay() + 7) % 7;
    nextRun.setDate(from.getDate() + dayOffset);
    nextRun.setHours(hour, minute, 0, 0);
    if (nextRun.getTime() <= from.getTime()) {
      nextRun.setDate(nextRun.getDate() + 7);
    }
    return nextRun.getTime();
  }

  nextRun.setHours(hour, minute, 0, 0);
  if (nextRun.getTime() <= from.getTime()) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  return nextRun.getTime();
}

function resolveAutoBackupIntervalMinutes(server: MinecraftServer): number {
  return Math.min(1440, Math.max(1, Math.floor(server.autoBackupIntervalMin ?? 60)));
}

function buildAutoBackupScheduleSignature(server: MinecraftServer): string {
  const scheduleType = resolveAutoBackupScheduleType(server);
  if (scheduleType === 'interval') {
    return `${scheduleType}:${resolveAutoBackupIntervalMinutes(server)}`;
  }
  const { hour, minute } = resolveAutoBackupTimeParts(server);
  if (scheduleType === 'weekly') {
    return `${scheduleType}:${resolveAutoBackupWeekday(server)}:${hour}:${minute}`;
  }
  return `${scheduleType}:${hour}:${minute}`;
}

function createAutoBackupScheduleEntry(
  server: MinecraftServer,
  now: Date,
): AutoBackupScheduleEntry {
  const scheduleType = resolveAutoBackupScheduleType(server);
  const intervalMinutes = resolveAutoBackupIntervalMinutes(server);
  return {
    signature: buildAutoBackupScheduleSignature(server),
    scheduleType,
    intervalMinutes,
    nextRunAt:
      scheduleType === 'interval'
        ? now.getTime() + intervalMinutes * 60 * 1000
        : computeNextTimeBasedAutoBackupRunAt(server, now, { allowCurrentMinute: true }),
  };
}

function computeNextAutoBackupRunAt(server: MinecraftServer, nowMs: number): number {
  const scheduleType = resolveAutoBackupScheduleType(server);
  if (scheduleType === 'interval') {
    return nowMs + resolveAutoBackupIntervalMinutes(server) * 60 * 1000;
  }
  return computeNextTimeBasedAutoBackupRunAt(server, new Date(nowMs + 60_000), {
    allowCurrentMinute: false,
  });
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
  const autoRestartScheduleRef = useRef<Record<string, AutoRestartScheduleEntry>>({});
  const autoBackupScheduleRef = useRef<Record<string, AutoBackupScheduleEntry>>({});
  const autoBackupRunningRef = useRef<Record<string, boolean>>({});
  const automationTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const automationTickInFlightRef = useRef(false);
  const automationTickRerunRequestedRef = useRef(false);
  const runAutomationTickRef = useRef<() => Promise<void>>(async () => {});

  const clearAutomationTimer = useCallback(() => {
    if (automationTimerRef.current) {
      window.clearTimeout(automationTimerRef.current);
      automationTimerRef.current = null;
    }
  }, []);

  const scheduleAutomationTick = useCallback(() => {
    if (automationTickInFlightRef.current) {
      automationTickRerunRequestedRef.current = true;
      return;
    }

    clearAutomationTimer();

    let nextDue = Number.POSITIVE_INFINITY;
    for (const restartEntry of Object.values(autoRestartScheduleRef.current)) {
      nextDue = Math.min(nextDue, restartEntry.dueAt);
    }
    for (const backupEntry of Object.values(autoBackupScheduleRef.current)) {
      nextDue = Math.min(nextDue, backupEntry.nextRunAt);
    }

    if (!Number.isFinite(nextDue)) {
      return;
    }

    const delayMs = Math.max(0, nextDue - Date.now());
    automationTimerRef.current = window.setTimeout(() => {
      void runAutomationTickRef.current();
    }, delayMs);
  }, [clearAutomationTimer]);

  const clearAutoRestartTimer = useCallback(
    (serverId: string) => {
      if (autoRestartScheduleRef.current[serverId]) {
        delete autoRestartScheduleRef.current[serverId];
        scheduleAutomationTick();
      }
    },
    [scheduleAutomationTick],
  );

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

  const clearAutoBackupSchedule = useCallback(
    (serverId: string) => {
      if (autoBackupScheduleRef.current[serverId]) {
        delete autoBackupScheduleRef.current[serverId];
        scheduleAutomationTick();
      }
      delete autoBackupRunningRef.current[serverId];
    },
    [scheduleAutomationTick],
  );

  const runAutoBackup = useCallback(
    async (serverId: string): Promise<boolean> => {
      if (autoBackupRunningRef.current[serverId]) {
        return false;
      }

      const targetServer = serversRef.current.find((server) => server.id === serverId);
      if (!targetServer?.autoBackupEnabled || targetServer.status !== 'online') {
        return false;
      }

      autoBackupRunningRef.current[serverId] = true;
      try {
        await createBackup(targetServer.path, buildAutoBackupName(targetServer));
        showToast(t('server.toast.autoBackupCreated', { name: targetServer.name }), 'success');
        return true;
      } catch (error) {
        console.error('Auto backup failed:', error);
        showToast(t('server.toast.autoBackupFailed', { name: targetServer.name }), 'error');
        return false;
      } finally {
        autoBackupRunningRef.current[serverId] = false;
      }
    },
    [showToast, t],
  );

  const runAutomationTick = useCallback(async () => {
    if (automationTickInFlightRef.current) {
      automationTickRerunRequestedRef.current = true;
      return;
    }

    automationTickInFlightRef.current = true;
    automationTickRerunRequestedRef.current = false;
    clearAutomationTimer();
    const nowMs = Date.now();
    let shouldRunImmediately = false;

    try {
      for (const [serverId, restartEntry] of Object.entries(autoRestartScheduleRef.current)) {
        if (restartEntry.dueAt > nowMs) {
          continue;
        }

        delete autoRestartScheduleRef.current[serverId];

        const latestServer = serversRef.current.find((server) => server.id === serverId);
        if (!latestServer?.autoRestartOnCrash) {
          resetAutoRestartState(serverId);
          continue;
        }

        try {
          const running = await isServerRunning(serverId);
          if (running) {
            resetAutoRestartState(serverId);
            continue;
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
              attempt: restartEntry.attempt,
              max: restartEntry.maxAutoRestarts,
            }),
            'error',
          );
        }
      }

      for (const [serverId, backupEntry] of Object.entries(autoBackupScheduleRef.current)) {
        if (backupEntry.nextRunAt > nowMs) {
          continue;
        }

        const latestServer = serversRef.current.find((server) => server.id === serverId);
        if (!latestServer?.autoBackupEnabled) {
          clearAutoBackupSchedule(serverId);
          continue;
        }

        const backupCompleted = await runAutoBackup(serverId);

        const refreshedServer = serversRef.current.find((server) => server.id === serverId);
        if (!refreshedServer?.autoBackupEnabled) {
          clearAutoBackupSchedule(serverId);
          continue;
        }

        if (!backupCompleted) {
          autoBackupScheduleRef.current[serverId] = {
            signature: buildAutoBackupScheduleSignature(refreshedServer),
            scheduleType: resolveAutoBackupScheduleType(refreshedServer),
            intervalMinutes: resolveAutoBackupIntervalMinutes(refreshedServer),
            nextRunAt: Date.now() + AUTO_BACKUP_RETRY_DELAY_MS,
          };
          continue;
        }

        const nextRunNowMs = Date.now();
        autoBackupScheduleRef.current[serverId] = {
          signature: buildAutoBackupScheduleSignature(refreshedServer),
          scheduleType: resolveAutoBackupScheduleType(refreshedServer),
          intervalMinutes: resolveAutoBackupIntervalMinutes(refreshedServer),
          nextRunAt: computeNextAutoBackupRunAt(refreshedServer, nextRunNowMs),
        };
      }
    } finally {
      automationTickInFlightRef.current = false;
      if (automationTickRerunRequestedRef.current) {
        automationTickRerunRequestedRef.current = false;
        shouldRunImmediately = true;
      }
    }
    if (shouldRunImmediately) {
      void runAutomationTickRef.current();
      return;
    }
    scheduleAutomationTick();
  }, [
    clearAutoBackupSchedule,
    clearAutomationTimer,
    resetAutoRestartState,
    runAutoBackup,
    scheduleAutomationTick,
    setServers,
    showToast,
    t,
  ]);

  runAutomationTickRef.current = runAutomationTick;

  useEffect(() => {
    serversRef.current = servers;

    const activeServerIds = new Set(servers.map((server) => server.id));
    for (const serverId of Object.keys(autoRestartScheduleRef.current)) {
      if (!activeServerIds.has(serverId)) {
        delete autoRestartScheduleRef.current[serverId];
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

    for (const serverId of Object.keys(autoBackupScheduleRef.current)) {
      if (!activeServerIds.has(serverId)) {
        delete autoBackupScheduleRef.current[serverId];
        delete autoBackupRunningRef.current[serverId];
      }
    }

    const now = new Date();
    for (const server of servers) {
      if (!server.autoBackupEnabled) {
        delete autoBackupScheduleRef.current[server.id];
        delete autoBackupRunningRef.current[server.id];
        continue;
      }

      const signature = buildAutoBackupScheduleSignature(server);
      const existing = autoBackupScheduleRef.current[server.id];
      if (existing && existing.signature === signature) {
        continue;
      }

      autoBackupScheduleRef.current[server.id] = createAutoBackupScheduleEntry(server, now);
    }
    scheduleAutomationTick();
  }, [scheduleAutomationTick, servers]);

  useEffect(() => {
    return () => {
      clearAutomationTimer();
      autoRestartScheduleRef.current = {};
      autoBackupScheduleRef.current = {};
      autoBackupRunningRef.current = {};
      automationTickInFlightRef.current = false;
      automationTickRerunRequestedRef.current = false;
    };
  }, [clearAutomationTimer]);

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

      if (
        (status === 'offline' || status === 'crashed') &&
        (previousStatus === 'restarting' || Boolean(autoRestartScheduleRef.current[serverId]))
      ) {
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

      autoRestartScheduleRef.current[serverId] = {
        dueAt: Date.now() + restartDelaySec * 1000,
        attempt: nextAttempt,
        maxAutoRestarts,
      };
      scheduleAutomationTick();
    },
    [
      clearAutoRestartTimer,
      clearExpectedOffline,
      consumeExpectedOffline,
      resetAutoRestartState,
      setServers,
      scheduleAutomationTick,
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
