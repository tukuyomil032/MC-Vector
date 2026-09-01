import { ask } from '@tauri-apps/plugin-dialog';
import { useCallback } from 'react';
import type { Translate } from '../../i18n';
import { getServerRoot } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';
import { cloneManagedServer } from '../../lib/file-commands';
import {
  type ServerTemplate,
  addServer as addServerApi,
  deleteServer as deleteServerApi,
  saveServerTemplate,
} from '../../lib/server-commands';
import type { MinecraftServer } from '../shared/server declaration';
import type { ToastKind } from '../shared/toast';
type SetServers = (
  nextServers: MinecraftServer[] | ((prevServers: MinecraftServer[]) => MinecraftServer[]),
) => void;

interface UseServerContextActionsOptions {
  servers: MinecraftServer[];
  setServers: SetServers;
  selectedServerId: string;
  setSelectedServerId: (serverId: string) => void;
  showToast: (message: string, type?: ToastKind) => void;
  t: Translate;
  removeServerLogs: (serverId: string) => void;
  loadTemplates: () => Promise<void>;
}

function buildTemplateFromServer(server: MinecraftServer, templateName: string): ServerTemplate {
  return {
    id: crypto.randomUUID(),
    name: templateName,
    profileName: server.profileName,
    groupName: server.groupName,
    version: server.version,
    software: server.software,
    port: server.port,
    memory: server.memory,
    javaPath: server.javaPath,
    autoRestartOnCrash: server.autoRestartOnCrash,
    maxAutoRestarts: server.maxAutoRestarts,
    autoRestartDelaySec: server.autoRestartDelaySec,
    autoBackupEnabled: server.autoBackupEnabled,
    autoBackupIntervalMin: server.autoBackupIntervalMin,
    autoBackupScheduleType: server.autoBackupScheduleType,
    autoBackupTime: server.autoBackupTime,
    autoBackupWeekday: server.autoBackupWeekday,
  };
}

export function useServerContextActions({
  servers,
  setServers,
  selectedServerId,
  setSelectedServerId,
  showToast,
  t,
  removeServerLogs,
  loadTemplates,
}: UseServerContextActionsOptions) {
  const handleDeleteServer = useCallback(
    async (serverId: string) => {
      const target = servers.find((server) => server.id === serverId);
      if (!target) {
        return;
      }

      const confirmed = await ask(
        t('server.confirm.deleteManaged', {
          name: target.name,
          path: target.path,
        }),
        {
          title: t('common.delete'),
          kind: 'warning',
        },
      );
      if (!confirmed) {
        return;
      }

      try {
        const success = await deleteServerApi(serverId);
        if (success) {
          const nextServers = servers.filter((server) => server.id !== serverId);
          setServers(nextServers);
          removeServerLogs(serverId);
          if (selectedServerId === serverId) {
            setSelectedServerId(nextServers.length > 0 ? nextServers[0].id : '');
          }
          showToast(t('server.toast.deleted'), 'success');
        } else {
          showToast(t('server.toast.deleteFailed'), 'error');
        }
      } catch (error) {
        logError('Delete server failed', error, { serverId });
        const message = error instanceof Error ? error.message : String(error);
        showToast(
          message.includes('Cannot delete a running server')
            ? t('server.toast.deleteRunning')
            : t('server.toast.deleteError'),
          'error',
        );
      }
    },
    [removeServerLogs, selectedServerId, servers, setSelectedServerId, setServers, showToast, t],
  );

  const handleDuplicateServer = useCallback(
    async (serverId: string) => {
      const target = servers.find((server) => server.id === serverId);
      if (!target) {
        return;
      }

      const confirmed = await ask(t('server.confirm.clone', { name: target.name }), {
        title: t('common.confirm'),
        kind: 'info',
      });
      if (!confirmed) {
        return;
      }

      try {
        const duplicatedId = crypto.randomUUID();
        await cloneManagedServer(target.id, duplicatedId);
        const candidatePath = `${await getServerRoot()}/${duplicatedId}`;

        const duplicatedServer: MinecraftServer = {
          ...target,
          id: duplicatedId,
          name: t('server.create.cloneDefaultName', { name: target.name }),
          path: candidatePath,
          status: 'offline',
          createdDate: new Date().toISOString(),
        };

        await addServerApi(duplicatedServer);
        setServers((prev) => [...prev, duplicatedServer]);
        setSelectedServerId(duplicatedServer.id);
        showToast(t('server.toast.cloned'), 'success');
      } catch (error) {
        logError('Duplicate server failed', error, {
          sourceServerId: target.id,
          sourcePath: target.path,
        });
        showToast(t('server.toast.cloneFailed'), 'error');
      }
    },
    [servers, setSelectedServerId, setServers, showToast, t],
  );

  const handleSaveServerTemplate = useCallback(
    async (serverId: string) => {
      const target = servers.find((server) => server.id === serverId);
      if (!target) {
        return;
      }

      const templateName = window.prompt(
        t('server.create.templateNamePrompt'),
        t('server.create.templateDefaultName', { name: target.name }),
      );
      if (!templateName || !templateName.trim()) {
        return;
      }

      try {
        const template = buildTemplateFromServer(target, templateName.trim());
        await saveServerTemplate(template);
        await loadTemplates();
        showToast(t('server.toast.templateSaved'), 'success');
      } catch (error) {
        logError('Save server template failed', error, {
          serverId: target.id,
          templateName: templateName.trim(),
        });
        showToast(t('server.toast.templateSaveFailed'), 'error');
      }
    },
    [loadTemplates, servers, showToast, t],
  );

  return {
    handleDeleteServer,
    handleDuplicateServer,
    handleSaveServerTemplate,
  };
}
