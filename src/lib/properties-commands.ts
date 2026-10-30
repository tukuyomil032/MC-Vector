import { tauriInvoke } from './tauri-api';

export type PropertyValue = string | number | boolean;

export interface ProxyNetworkRequest {
  proxySoftware: string;
  proxyPort: number;
  backendServerIds: string[];
}

export interface ProxyBackendPort {
  serverId: string;
  port: number;
}

export async function getServerProperties(
  serverId: string,
): Promise<Record<string, PropertyValue>> {
  return tauriInvoke<Record<string, PropertyValue>>('get_server_properties', { serverId });
}

export async function saveServerProperties(
  serverId: string,
  updates: Record<string, PropertyValue>,
): Promise<number | null> {
  return tauriInvoke<number | null>('save_server_properties', { serverId, updates });
}

export async function configureProxyNetwork(
  request: ProxyNetworkRequest,
): Promise<ProxyBackendPort[]> {
  return tauriInvoke<ProxyBackendPort[]>('configure_proxy_network', { request });
}
