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
import { notify } from '../shared/notify';

type SetServers = (
  nextServers: MinecraftServer[] | ((prevServers: MinecraftServer[]) => MinecraftServer[]),
) => void;

interface UseServerCreateActionOptions {
  setServers: SetServers;
  setSelectedServerId: (serverId: string) => void;
  setShowAddServerModal: (open: boolean) => void;
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
      // One toast per creation: progress updates it in place, and the final result replaces it.
      const progressKey = `server-create-${operationId}`;
      const progressTitle = t('server.toast.downloadingServer', {
        software: request.software,
        version: request.version,
      });
      let finished = false;
      let unlisten: UnlistenFn | null = null;

      try {
        try {
          unlisten = await onServerCreationProgress((event) => {
            if (finished || event.operationId !== operationId) {
              return;
            }
            notify.progress(progressKey, { title: progressTitle, progress: event.progress });
          });
        } catch (error) {
          logError('Failed to subscribe to server creation progress', error);
        }

        const result = await createServerProfile(request);
        finished = true;
        setServers((previous) => [...previous, result.server]);
        setSelectedServerId(result.server.id);
        setShowAddServerModal(false);
        notify.done(progressKey, {
          type: 'success',
          title: t('server.toast.created', { name: result.server.name }),
        });
        if (!result.jarInstalled) {
          notify.info(t('server.toast.jarUrlFailed'));
        }
      } catch (error) {
        finished = true;
        logError('Server creation failed', error, {
          software: request.software,
          version: request.version,
          imported: Boolean(request.importToken),
        });
        notify.done(progressKey, { type: 'error', title: t('server.toast.createFailed') });
      } finally {
        finished = true;
        unlisten?.();
        isCreating.current = false;
      }
    },
    [setSelectedServerId, setServers, setShowAddServerModal, t],
  );

  return { handleAddServer };
}
