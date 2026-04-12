import { ask } from '@tauri-apps/plugin-dialog';
import { useCallback } from 'react';
import { readFileContent, saveFileContent } from '../../lib/file-commands';
import { getServers, updateServer as updateServerApi } from '../../lib/server-commands';
import type { ToastKind } from '../components/ToastProvider';
import type { ProxyNetworkConfig } from '../components/ProxySetupView';
import type { MinecraftServer } from '../shared/server declaration';

type Translate = (key: string, values?: Record<string, unknown>) => string;
type SetServers = (
  nextServers: MinecraftServer[] | ((prevServers: MinecraftServer[]) => MinecraftServer[]),
) => void;

interface UseProxyNetworkActionOptions {
  servers: MinecraftServer[];
  setServers: SetServers;
  showToast: (message: string, type?: ToastKind) => void;
  t: Translate;
}

export function useProxyNetworkAction({
  servers,
  setServers,
  showToast,
  t,
}: UseProxyNetworkActionOptions) {
  const handleBuildProxyNetwork = useCallback(
    async (config: ProxyNetworkConfig) => {
      const confirmed = await ask(t('proxy.confirmRewriteProperties'), {
        title: t('proxy.configTitle'),
        kind: 'info',
      });
      if (!confirmed) {
        return;
      }

      try {
        const backendServers = servers.filter((server) =>
          config.backendServerIds.includes(server.id),
        );

        await Promise.all(
          backendServers.map(async (server, index) => {
            const propsPath = `${server.path}/server.properties`;
            let props = '';
            try {
              props = await readFileContent(propsPath);
            } catch {
              props = '';
            }

            if (props.includes('online-mode=')) {
              props = props.replace(/online-mode=.*/g, 'online-mode=false');
            } else {
              props += '\nonline-mode=false';
            }

            const port = 25566 + index;
            if (props.includes('server-port=')) {
              props = props.replace(/server-port=.*/g, `server-port=${port}`);
            } else {
              props += `\nserver-port=${port}`;
            }

            await saveFileContent(propsPath, props);
            await updateServerApi({ ...server, port });
          }),
        );

        showToast(
          t('proxy.settingsUpdated', {
            count: backendServers.length,
            software: config.proxySoftware,
            port: config.proxyPort,
          }),
          'success',
        );

        const loadedServers = await getServers();
        setServers(loadedServers);
      } catch (error) {
        console.error('Proxy build error:', error);
        showToast(t('proxy.configError'), 'error');
      }
    },
    [servers, setServers, showToast, t],
  );

  return { handleBuildProxyNetwork };
}
