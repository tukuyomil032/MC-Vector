import { useCallback } from 'react';
import type { Translate } from '../../i18n';
import { logError } from '../../lib/error-utils';
import { cloneServerProfile, deleteManagedServer } from '../../lib/server-lifecycle-commands';
import { type ServerTemplate, saveServerTemplate } from '../../lib/server-commands';
import { useAppFeedback } from '../components/AppFeedbackProvider';
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
  const { confirm, prompt } = useAppFeedback();

  const handleDeleteServer = useCallback(
    async (serverId: string) => {
      const target = servers.find((server) => server.id === serverId);
      if (!target) {
        return;
      }

      const confirmed = await confirm({
        title: t('common.delete'),
        description: t('server.confirm.deleteManaged', {
          name: target.name,
          path: target.path,
        }),
        confirmLabel: t('common.delete'),
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }

      try {
        const success = await deleteManagedServer(serverId);
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
    [
      confirm,
      removeServerLogs,
      selectedServerId,
      servers,
      setSelectedServerId,
      setServers,
      showToast,
      t,
    ],
  );

  const handleDuplicateServer = useCallback(
    async (serverId: string) => {
      const target = servers.find((server) => server.id === serverId);
      if (!target) {
        return;
      }

      const confirmed = await confirm({
        title: t('common.confirm'),
        description: t('server.confirm.clone', { name: target.name }),
      });
      if (!confirmed) {
        return;
      }

      try {
        const duplicatedServer = await cloneServerProfile(
          target.id,
          t('server.create.cloneDefaultName', { name: target.name }),
        );
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
    [confirm, servers, setSelectedServerId, setServers, showToast, t],
  );

  const handleSaveServerTemplate = useCallback(
    async (serverId: string) => {
      const target = servers.find((server) => server.id === serverId);
      if (!target) {
        return;
      }

      const templateName = await prompt({
        title: t('server.create.templateNamePrompt'),
        label: t('server.create.templateNameLabel'),
        defaultValue: t('server.create.templateDefaultName', { name: target.name }),
        confirmLabel: t('common.save'),
      });
      if (!templateName) {
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
    [loadTemplates, prompt, servers, showToast, t],
  );

  return {
    handleDeleteServer,
    handleDuplicateServer,
    handleSaveServerTemplate,
  };
}
