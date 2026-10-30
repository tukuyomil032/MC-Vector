import { ask } from '@tauri-apps/plugin-dialog';
import { useCallback } from 'react';
import type { Translate } from '../../i18n';
import { logError } from '../../lib/error-utils';
import { configureProxyNetwork } from '../../lib/properties-commands';
import type { ProxyNetworkConfig } from '../components/ProxySetupView';
import type { MinecraftServer } from '../shared/server declaration';
import type { ToastKind } from '../shared/toast';
type SetServers = (
  nextServers: MinecraftServer[] | ((prevServers: MinecraftServer[]) => MinecraftServer[]),
) => void;

interface UseProxyNetworkActionOptions {
  setServers: SetServers;
  showToast: (message: string, type?: ToastKind) => void;
  t: Translate;
}

export function useProxyNetworkAction({ setServers, showToast, t }: UseProxyNetworkActionOptions) {
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
        const backendPorts = await configureProxyNetwork(config);

        showToast(
          t('proxy.settingsUpdated', {
            count: backendPorts.length,
            software: config.proxySoftware,
            port: config.proxyPort,
          }),
          'success',
        );

        const portsByServerId = new Map(backendPorts.map(({ serverId, port }) => [serverId, port]));
        setServers((previous) =>
          previous.map((server) => {
            const port = portsByServerId.get(server.id);
            return port === undefined ? server : { ...server, port };
          }),
        );
      } catch (error) {
        logError('Proxy build failed', error, {
          proxySoftware: config.proxySoftware,
          backendCount: config.backendServerIds.length,
        });
        showToast(t('proxy.configError'), 'error');
      }
    },
    [setServers, showToast, t],
  );

  return { handleBuildProxyNetwork };
}
