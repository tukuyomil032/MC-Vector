import { mkdir } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { useCallback } from 'react';
import { addServer as addServerApi, downloadServerJar } from '../../lib/server-commands';
import type { ToastKind } from '../components/ToastProvider';
import type { MinecraftServer } from '../shared/server declaration';

type Translate = (key: string, values?: Record<string, unknown>) => string;
type SetServers = (
  nextServers: MinecraftServer[] | ((prevServers: MinecraftServer[]) => MinecraftServer[]),
) => void;
type SetDownloadStatus = (status: { id: string; progress: number; msg: string } | null) => void;

type PaperBuildsResponse = {
  builds?: Array<{ build: number; downloads?: { application?: { name?: string } } }>;
};
type MojangManifest = { versions?: Array<{ id: string; url: string }> };
type VerDetail = { downloads?: { server?: { url?: string } } };
type FabricLoader = Array<{ version: string }>;

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
      try {
        const source = serverData as Record<string, unknown>;
        const id = crypto.randomUUID();
        const serverPath = typeof source.path === 'string' ? source.path : '';
        if (!serverPath) {
          showToast(t('server.toast.pathEmpty'), 'error');
          return;
        }

        await mkdir(serverPath, { recursive: true });

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
        await addServerApi(newServer);
        setServers((prev) => [...prev, newServer]);
        setSelectedServerId(newServer.id);
        setShowAddServerModal(false);
        showToast(t('server.toast.created'), 'success');

        const software = (source.software as string) || 'Vanilla';
        const version = (source.version as string) || '';
        let downloadUrl = '';

        try {
          if (software === 'Paper' || software === 'LeafMC') {
            const project = software === 'Paper' ? 'paper' : 'leafmc';
            const buildsResponse = await tauriFetch(
              `https://api.papermc.io/v2/projects/${project}/versions/${version}/builds`,
            );
            const buildsData = (await buildsResponse.json()) as PaperBuildsResponse;
            if (buildsData.builds && buildsData.builds.length > 0) {
              const latestBuild = buildsData.builds[buildsData.builds.length - 1];
              const buildNumber = latestBuild.build;
              const fileName =
                latestBuild.downloads?.application?.name ||
                `${project}-${version}-${buildNumber}.jar`;
              downloadUrl = `https://api.papermc.io/v2/projects/${project}/versions/${version}/builds/${buildNumber}/downloads/${fileName}`;
            }
          } else if (software === 'Vanilla') {
            const manifestResponse = await tauriFetch(
              'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
            );
            const manifest = (await manifestResponse.json()) as MojangManifest;
            const versionInfo = manifest.versions?.find((entry) => entry.id === version);
            if (versionInfo) {
              const versionDetailResponse = await tauriFetch(versionInfo.url);
              const versionDetail = (await versionDetailResponse.json()) as VerDetail;
              downloadUrl = versionDetail.downloads?.server?.url || '';
            }
          } else if (software === 'Fabric') {
            const loaderResponse = await tauriFetch('https://meta.fabricmc.net/v2/versions/loader');
            const loaders = (await loaderResponse.json()) as FabricLoader;
            const latestLoader = loaders?.[0]?.version || '';
            if (latestLoader) {
              downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${version}/${latestLoader}/1.0.1/server/jar`;
            }
          }
        } catch (error) {
          console.error('Failed to resolve download URL:', error);
        }

        if (downloadUrl) {
          setDownloadStatus({
            id: newServer.id,
            progress: 0,
            msg: t('server.toast.downloadStarting'),
          });
          try {
            await downloadServerJar(downloadUrl, `${serverPath}/server.jar`, newServer.id);
          } catch (error) {
            console.error('Download failed:', error);
            setDownloadStatus(null);
            showToast(t('server.toast.jarDownloadFailed'), 'error');
          }
        } else {
          showToast(t('server.toast.jarUrlFailed'), 'info');
        }
      } catch (error) {
        console.error('Server creation error:', error);
        showToast(t('server.toast.createFailed'), 'error');
        setDownloadStatus(null);
      }
    },
    [setDownloadStatus, setSelectedServerId, setServers, setShowAddServerModal, showToast, t],
  );

  return { handleAddServer };
}
