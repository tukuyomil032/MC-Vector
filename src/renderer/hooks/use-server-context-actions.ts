import { ask } from '@tauri-apps/plugin-dialog';
import { copyFile, mkdir, readDir } from '@tauri-apps/plugin-fs';
import { useCallback } from 'react';
import type { Translate } from '../../i18n';
import { getServerRoot } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';
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
const WINDOWS_DRIVE_ROOT = /^[A-Za-z]:\/$/;

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

function normalizePath(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/') && !WINDOWS_DRIVE_ROOT.test(normalized)) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function isDirectManagedServerPath(serverPath: string, serverRoot: string): boolean {
  const normalizedServerPath = normalizePath(serverPath.trim());
  const normalizedServerRoot = normalizePath(serverRoot.trim());
  if (!normalizedServerPath || normalizedServerPath === normalizedServerRoot) {
    return false;
  }

  const parentPath = normalizedServerPath.split('/').slice(0, -1).join('/');
  return parentPath === normalizedServerRoot;
}

async function cloneServerDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  const entries = await readDir(sourceDir);
  for (const entry of entries) {
    const entryName = entry.name;
    if (!entryName) {
      continue;
    }

    const sourcePath = `${sourceDir}/${entryName}`;
    const targetPath = `${targetDir}/${entryName}`;
    if (entry.isDirectory) {
      await cloneServerDirectory(sourcePath, targetPath);
    } else {
      await copyFile(sourcePath, targetPath);
    }
  }
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

      let isManagedServer = false;
      try {
        isManagedServer = isDirectManagedServerPath(target.path, await getServerRoot());
      } catch (error) {
        logError('Resolve server root for delete confirmation failed', error, {
          serverId,
          serverPath: target.path,
        });
        showToast(t('server.toast.deleteError'), 'error');
        return;
      }

      const confirmed = await ask(
        t(isManagedServer ? 'server.confirm.deleteManaged' : 'server.confirm.deleteExternal', {
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
        const basePath = `${target.path}-clone`;
        const existingPaths = new Set(servers.map((server) => server.path));
        let candidatePath = basePath;
        let suffix = 1;
        while (existingPaths.has(candidatePath)) {
          candidatePath = `${basePath}-${suffix}`;
          suffix += 1;
        }

        await cloneServerDirectory(target.path, candidatePath);

        const duplicatedServer: MinecraftServer = {
          ...target,
          id: crypto.randomUUID(),
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
