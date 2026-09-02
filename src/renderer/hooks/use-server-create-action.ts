import { useCallback } from 'react';
import type { Translate } from '../../i18n';
import { getServerRoot } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';
import {
  createManagedServerDirectory,
  deleteManagedServerDirectory,
} from '../../lib/file-commands';
import { addServer as addServerApi, downloadServerJar } from '../../lib/server-commands';
import { completeServerImport } from '../../lib/server-import-commands';
import { resolveRequestedJarUrl } from '../../lib/version-commands';
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

export function useServerCreateAction({
  setServers,
  setSelectedServerId,
  setShowAddServerModal,
  setDownloadStatus,
  showToast,
  t,
}: UseServerCreateActionOptions) {
  const handleAddServer = useCallback(
    async (serverData: unknown) => {
      const id = crypto.randomUUID();
      let createdDirectory = false;
      let createdServerPath = '';
      try {
        const source = serverData as Record<string, unknown>;
        const importToken = typeof source.importToken === 'string' ? source.importToken : null;
        const serverPath = `${await getServerRoot()}/${id}`;
        await createManagedServerDirectory(id);
        createdServerPath = serverPath;
        createdDirectory = true;

        const newServer: MinecraftServer = {
          id,
          name: (source.name as string) || 'New Server',
          profileName:
            typeof source.profileName === 'string' ? source.profileName || undefined : undefined,
          groupName:
            typeof source.groupName === 'string' ? source.groupName || undefined : undefined,
          version: (source.version as string) || '',
          software: (source.software as string) || 'Vanilla',
          port: (source.port as number) || 25565,
          memory: ((source.memory as number) || 4) * 1024,
          path: serverPath,
          status: 'offline',
          javaPath: (source.javaPath as string) || undefined,
          autoRestartOnCrash:
            typeof source.autoRestartOnCrash === 'boolean' ? source.autoRestartOnCrash : false,
          maxAutoRestarts: typeof source.maxAutoRestarts === 'number' ? source.maxAutoRestarts : 3,
          autoRestartDelaySec:
            typeof source.autoRestartDelaySec === 'number' ? source.autoRestartDelaySec : 5,
          autoBackupEnabled:
            typeof source.autoBackupEnabled === 'boolean' ? source.autoBackupEnabled : false,
          autoBackupIntervalMin:
            typeof source.autoBackupIntervalMin === 'number' ? source.autoBackupIntervalMin : 60,
          autoBackupScheduleType:
            source.autoBackupScheduleType === 'daily' || source.autoBackupScheduleType === 'weekly'
              ? source.autoBackupScheduleType
              : 'interval',
          autoBackupTime:
            typeof source.autoBackupTime === 'string' ? source.autoBackupTime : '03:00',
          autoBackupWeekday:
            typeof source.autoBackupWeekday === 'number' ? Math.floor(source.autoBackupWeekday) : 0,
          createdDate: new Date().toISOString(),
        };
        const software = (source.software as string) || 'Vanilla';
        const version = (source.version as string) || '';
        let resolution: Awaited<ReturnType<typeof resolveRequestedJarUrl>> = null;

        if (importToken) {
          await completeServerImport(importToken, newServer.id);
        } else {
          const autoDownloadSoftware = new Set(['Paper', 'LeafMC', 'Vanilla', 'Fabric']);
          resolution = await resolveRequestedJarUrl(software, version);

          if (resolution) {
            setDownloadStatus({
              id: newServer.id,
              progress: 0,
              msg: t('server.toast.downloadStarting'),
            });
            try {
              await downloadServerJar(
                resolution.downloadUrl,
                newServer.id,
                'server.jar',
                resolution.sha256,
              );
            } catch (error) {
              logError('Server jar download failed', error, {
                serverId: newServer.id,
                serverPath,
                downloadUrl: resolution.downloadUrl,
              });
              setDownloadStatus(null);
              throw error;
            }
          } else if (autoDownloadSoftware.has(software)) {
            throw new Error(`No official stable JAR is available for ${software} ${version}`);
          }
        }

        await addServerApi(newServer);
        setServers((prev) => [...prev, newServer]);
        setSelectedServerId(newServer.id);
        setShowAddServerModal(false);
        showToast(t('server.toast.created'), 'success');
        setDownloadStatus(null);
        if (!resolution) {
          showToast(t('server.toast.jarUrlFailed'), 'info');
        }
      } catch (error) {
        if (createdDirectory && createdServerPath) {
          try {
            await deleteManagedServerDirectory(id);
          } catch (cleanupError) {
            logError('Failed to roll back server directory', cleanupError, {
              serverPath: createdServerPath,
            });
          }
        }
        logError('Server creation failed', error, {
          serverDataType: typeof serverData,
          software: (serverData as Record<string, unknown>).software,
          version: (serverData as Record<string, unknown>).version,
        });
        showToast(t('server.toast.createFailed'), 'error');
        setDownloadStatus(null);
      }
    },
    [setDownloadStatus, setSelectedServerId, setServers, setShowAddServerModal, showToast, t],
  );

  return { handleAddServer };
}
