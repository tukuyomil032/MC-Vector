import { ask } from '@tauri-apps/plugin-dialog';
import { copyFile, mkdir, readDir } from '@tauri-apps/plugin-fs';
import { type MouseEvent, useCallback } from 'react';
import {
  addServer as addServerApi,
  deleteServer as deleteServerApi,
  saveServerTemplate,
  type ServerTemplate,
} from '../../lib/server-commands';
import type { ServerContextMenuState } from '../../store/uiStore';
import type { ToastKind } from '../components/ToastProvider';
import type { MinecraftServer } from '../shared/server declaration';

type Translate = (key: string, values?: Record<string, unknown>) => string;
type SetServers = (
  nextServers: MinecraftServer[] | ((prevServers: MinecraftServer[]) => MinecraftServer[]),
) => void;

interface UseServerContextActionsOptions {
  servers: MinecraftServer[];
  setServers: SetServers;
  selectedServerId: string;
  setSelectedServerId: (serverId: string) => void;
  contextMenu: ServerContextMenuState | null;
  setContextMenu: (menu: ServerContextMenuState | null) => void;
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
  contextMenu,
  setContextMenu,
  showToast,
  t,
  removeServerLogs,
  loadTemplates,
}: UseServerContextActionsOptions) {
  const handleContextMenu = useCallback(
    (event: MouseEvent, serverId: string) => {
      event.preventDefault();
      setContextMenu({ x: event.pageX, y: event.pageY, serverId });
    },
    [setContextMenu],
  );

  const handleDeleteServer = useCallback(async () => {
    if (!contextMenu) {
      return;
    }
    const { serverId } = contextMenu;
    const target = servers.find((server) => server.id === serverId);
    setContextMenu(null);

    const confirmed = await ask(t('server.confirm.delete', { name: target?.name ?? '' }), {
      title: t('common.delete'),
      kind: 'warning',
    });
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
      console.error('Delete server error:', error);
      showToast(t('server.toast.deleteError'), 'error');
    }
  }, [
    contextMenu,
    removeServerLogs,
    selectedServerId,
    servers,
    setContextMenu,
    setSelectedServerId,
    setServers,
    showToast,
    t,
  ]);

  const handleDuplicateServer = useCallback(async () => {
    if (!contextMenu) {
      return;
    }

    const { serverId } = contextMenu;
    const target = servers.find((server) => server.id === serverId);
    setContextMenu(null);
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
      console.error('Duplicate server error:', error);
      showToast(t('server.toast.cloneFailed'), 'error');
    }
  }, [contextMenu, servers, setContextMenu, setSelectedServerId, setServers, showToast, t]);

  const handleSaveServerTemplate = useCallback(async () => {
    if (!contextMenu) {
      return;
    }

    const { serverId } = contextMenu;
    const target = servers.find((server) => server.id === serverId);
    setContextMenu(null);
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
      console.error('Save template error:', error);
      showToast(t('server.toast.templateSaveFailed'), 'error');
    }
  }, [contextMenu, loadTemplates, servers, setContextMenu, showToast, t]);

  const handleClickOutside = useCallback(() => {
    if (contextMenu) {
      setContextMenu(null);
    }
  }, [contextMenu, setContextMenu]);

  return {
    handleContextMenu,
    handleDeleteServer,
    handleDuplicateServer,
    handleSaveServerTemplate,
    handleClickOutside,
  };
}
