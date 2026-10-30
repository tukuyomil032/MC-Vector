import { useCallback, useEffect, useRef } from 'react';
import type { Translate } from '../../i18n';
import {
  cancelAutoRestart,
  onServerAutomationEvent,
  resumeAutoRestartAfterEula,
  type ServerAutomationEvent,
} from '../../lib/server-automation-commands';
import { sendServerNotification } from '../../lib/notification-commands';
import type { MinecraftServer } from '../shared/server declaration';
import type { ToastKind } from '../shared/toast';
import { type EulaGateMode, type EulaGateResult } from './use-server-eula-gate';

type SetServers = (
  nextServers: MinecraftServer[] | ((prevServers: MinecraftServer[]) => MinecraftServer[]),
) => void;

interface UseServerAutomationOptions {
  servers: MinecraftServer[];
  setServers: SetServers;
  showToast: (message: string, type?: ToastKind) => void;
  t: Translate;
  ensureServerEula: (server: MinecraftServer, mode: EulaGateMode) => Promise<EulaGateResult>;
}

interface ServerStatusChangeData {
  serverId: string;
  status: MinecraftServer['status'];
  expected?: boolean;
}

function automationToast(
  event: ServerAutomationEvent,
  t: Translate,
): { message: string; type: ToastKind } | null {
  switch (event.kind) {
    case 'auto_restart_scheduled':
      return {
        message: t('server.toast.autoRestartScheduled', {
          name: event.serverName,
          seconds: event.seconds ?? 0,
          attempt: event.attempt ?? 1,
          max: event.max ?? 1,
        }),
        type: 'info',
      };
    case 'auto_restart_limit_reached':
      return {
        message: t('server.toast.autoRestartLimitReached', { name: event.serverName }),
        type: 'error',
      };
    case 'auto_restart_failed':
      return {
        message: t('server.toast.autoRestartTriggered', {
          name: event.serverName,
          attempt: event.attempt ?? 1,
          max: event.max ?? 1,
        }),
        type: 'error',
      };
    case 'auto_restart_eula_required':
      return {
        message: t('server.toast.autoRestartEulaRequired', { name: event.serverName }),
        type: 'error',
      };
    case 'auto_backup_created':
      return {
        message: t('server.toast.autoBackupCreated', { name: event.serverName }),
        type: 'success',
      };
    case 'auto_backup_failed':
      return {
        message: t('server.toast.autoBackupFailed', { name: event.serverName }),
        type: 'error',
      };
    case 'auto_backup_retention_delete_failed':
      return {
        message: t('backups.toast.retentionDeleteFailed', { count: event.count ?? 0 }),
        type: 'warning',
      };
    case 'auto_backup_retention_list_failed':
      return { message: t('backups.toast.retentionListFailed'), type: 'warning' };
  }
}

export function useServerAutomation({
  servers,
  setServers,
  showToast,
  t,
  ensureServerEula,
}: UseServerAutomationOptions) {
  const serversRef = useRef<MinecraftServer[]>(servers);
  const expectedOfflineEventsRef = useRef<Record<string, number>>({});
  const handlerRef = useRef<(event: ServerAutomationEvent) => Promise<void>>(async () => {});

  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  const clearAutoRestartTimer = useCallback((serverId: string) => {
    void cancelAutoRestart(serverId).catch((error) => {
      console.error('Failed to cancel the Rust-managed auto restart:', error);
    });
  }, []);

  const resetAutoRestartState = useCallback((serverId: string) => {
    void cancelAutoRestart(serverId, true).catch((error) => {
      console.error('Failed to reset the Rust-managed auto restart:', error);
    });
  }, []);

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

  const handleAutomationEvent = useCallback(
    async (event: ServerAutomationEvent) => {
      const targetServer = serversRef.current.find((server) => server.id === event.serverId);
      if (!targetServer) {
        return;
      }

      if (event.kind === 'auto_restart_scheduled') {
        setServers((current) =>
          current.map((server) =>
            server.id === event.serverId ? { ...server, status: 'restarting' } : server,
          ),
        );
      }
      if (event.kind === 'auto_restart_failed' || event.kind === 'auto_restart_eula_required') {
        setServers((current) =>
          current.map((server) =>
            server.id === event.serverId ? { ...server, status: 'offline' } : server,
          ),
        );
      }

      const toast = automationToast(event, t);
      if (toast) {
        showToast(toast.message, toast.type);
      }
      if (event.kind === 'auto_backup_created' && event.catalogError) {
        showToast(t('backups.toast.registryUpdateFailed'), 'warning');
      }

      if (event.kind !== 'auto_restart_eula_required') {
        return;
      }

      try {
        const result = await ensureServerEula(targetServer, 'interactive');
        if (result !== 'accepted') {
          setServers((current) =>
            current.map((server) =>
              server.id === event.serverId ? { ...server, status: 'offline' } : server,
            ),
          );
          return;
        }
        await resumeAutoRestartAfterEula(event.serverId);
      } catch (error) {
        console.error('Failed to resume the Rust-managed restart after EULA acceptance:', error);
        setServers((current) =>
          current.map((server) =>
            server.id === event.serverId ? { ...server, status: 'offline' } : server,
          ),
        );
        showToast(
          t('server.toast.autoRestartTriggered', {
            name: event.serverName,
            attempt: event.attempt ?? 1,
            max: event.max ?? 1,
          }),
          'error',
        );
      }
    },
    [ensureServerEula, setServers, showToast, t],
  );

  handlerRef.current = handleAutomationEvent;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void onServerAutomationEvent((event) => {
      if (!cancelled) {
        void handlerRef.current(event);
      }
    })
      .then((dispose) => {
        if (cancelled) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })
      .catch((error) => {
        console.error('Failed to subscribe to Rust automation events:', error);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleServerStatusChange = useCallback(
    ({ serverId, status, expected }: ServerStatusChangeData) => {
      const previousStatus = serversRef.current.find((server) => server.id === serverId)?.status;
      setServers((current) =>
        current.map((server) => (server.id === serverId ? { ...server, status } : server)),
      );

      const currentServer = serversRef.current.find((server) => server.id === serverId);
      if (status === 'online') {
        if (currentServer?.notifyOnStart) {
          void sendServerNotification(currentServer.name, t('server.notification.started'));
        }
        clearExpectedOffline(serverId);
        resetAutoRestartState(serverId);
        return;
      }

      const expectedLocally = status === 'offline' && consumeExpectedOffline(serverId);
      if (status === 'offline' && (expected || expectedLocally)) {
        resetAutoRestartState(serverId);
        return;
      }

      if (status === 'offline' && previousStatus === 'offline') {
        resetAutoRestartState(serverId);
        return;
      }

      if (status === 'crashed' && currentServer?.notifyOnCrash !== false) {
        void sendServerNotification(
          currentServer?.name ?? serverId,
          t('server.notification.crashed'),
        );
      }
    },
    [clearExpectedOffline, consumeExpectedOffline, resetAutoRestartState, setServers, t],
  );

  return {
    clearAutoRestartTimer,
    resetAutoRestartState,
    markExpectedOffline,
    clearExpectedOffline,
    handleServerStatusChange,
  };
}
