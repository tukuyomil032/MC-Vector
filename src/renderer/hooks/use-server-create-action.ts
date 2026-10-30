import { useCallback, useRef } from 'react';
import type { Translate } from '../../i18n';
import { logError } from '../../lib/error-utils';
import {
  createServerProfile,
  onServerCreationProgress,
  type NewServerProfileRequest,
} from '../../lib/server-creation-commands';
import type { UnlistenFn } from '../../lib/tauri-api';
import type { MinecraftServer } from '../shared/server declaration';
import type { ToastKind } from '../shared/toast';

type SetServers = (
  nextServers: MinecraftServer[] | ((prevServers: MinecraftServer[]) => MinecraftServer[]),
) => void;
type SetDownloadStatus = (status: { id: string; progress: number; msg: string } | null) => void;

interface UseServerCreateActionOptions {
  setServers: SetServers;
  setSelectedServerId: (serverId: string) => void;
  setShowAddServerModal: (open: boolean) => void;
  setDownloadStatus: SetDownloadStatus;
  showToast: (message: string, type?: ToastKind) => void;
  t: Translate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toCreateRequest(serverData: unknown, operationId: string): NewServerProfileRequest {
  const source = isRecord(serverData) ? serverData : {};
  const rawScheduleType = source.autoBackupScheduleType;

  return {
    operationId,
    name: readString(source.name) ?? 'New Server',
    profileName: readString(source.profileName),
    groupName: readString(source.groupName),
    version: readString(source.version) ?? '',
    software: readString(source.software) ?? 'Vanilla',
    port: readNumber(source.port, 25565),
    memoryGb: readNumber(source.memory, 4),
    javaPath: readString(source.javaPath),
    autoRestartOnCrash:
      typeof source.autoRestartOnCrash === 'boolean' ? source.autoRestartOnCrash : undefined,
    maxAutoRestarts:
      typeof source.maxAutoRestarts === 'number' ? source.maxAutoRestarts : undefined,
    autoRestartDelaySec:
      typeof source.autoRestartDelaySec === 'number' ? source.autoRestartDelaySec : undefined,
    autoBackupEnabled:
      typeof source.autoBackupEnabled === 'boolean' ? source.autoBackupEnabled : undefined,
    autoBackupIntervalMin:
      typeof source.autoBackupIntervalMin === 'number' ? source.autoBackupIntervalMin : undefined,
    autoBackupScheduleType:
      rawScheduleType === 'daily' || rawScheduleType === 'weekly' || rawScheduleType === 'interval'
        ? rawScheduleType
        : undefined,
    autoBackupTime: readString(source.autoBackupTime),
    autoBackupWeekday:
      typeof source.autoBackupWeekday === 'number' ? source.autoBackupWeekday : undefined,
    autoBackupRetainCount:
      typeof source.autoBackupRetainCount === 'number' ? source.autoBackupRetainCount : undefined,
    autoBackupRetainDays:
      typeof source.autoBackupRetainDays === 'number' ? source.autoBackupRetainDays : undefined,
    backupRestartAfterSafeBackup:
      typeof source.backupRestartAfterSafeBackup === 'boolean'
        ? source.backupRestartAfterSafeBackup
        : undefined,
    jvmArgs: readString(source.jvmArgs),
    notifyOnCrash: typeof source.notifyOnCrash === 'boolean' ? source.notifyOnCrash : undefined,
    notifyOnStart: typeof source.notifyOnStart === 'boolean' ? source.notifyOnStart : undefined,
    notifyOnHighCpu:
      typeof source.notifyOnHighCpu === 'boolean' ? source.notifyOnHighCpu : undefined,
    notifyHighCpuThreshold:
      typeof source.notifyHighCpuThreshold === 'number' ? source.notifyHighCpuThreshold : undefined,
    importToken: readString(source.importToken),
  };
}

export function useServerCreateAction({
  setServers,
  setSelectedServerId,
  setShowAddServerModal,
  setDownloadStatus,
  showToast,
  t,
}: UseServerCreateActionOptions) {
  const isCreating = useRef(false);

  const handleAddServer = useCallback(
    async (serverData: unknown) => {
      if (isCreating.current) {
        return;
      }
      isCreating.current = true;
      const operationId = crypto.randomUUID();
      const request = toCreateRequest(serverData, operationId);
      let unlisten: UnlistenFn | null = null;

      try {
        try {
          unlisten = await onServerCreationProgress((event) => {
            if (event.operationId !== operationId) {
              return;
            }
            setDownloadStatus({
              id: operationId,
              progress: event.progress,
              msg: event.status,
            });
          });
        } catch (error) {
          logError('Failed to subscribe to server creation progress', error);
        }

        const result = await createServerProfile(request);
        setServers((previous) => [...previous, result.server]);
        setSelectedServerId(result.server.id);
        setShowAddServerModal(false);
        showToast(t('server.toast.created'), 'success');
        if (!result.jarInstalled) {
          showToast(t('server.toast.jarUrlFailed'), 'info');
        }
      } catch (error) {
        logError('Server creation failed', error, {
          software: request.software,
          version: request.version,
          imported: Boolean(request.importToken),
        });
        showToast(t('server.toast.createFailed'), 'error');
      } finally {
        unlisten?.();
        setDownloadStatus(null);
        isCreating.current = false;
      }
    },
    [setDownloadStatus, setSelectedServerId, setServers, setShowAddServerModal, showToast, t],
  );

  return { handleAddServer };
}
