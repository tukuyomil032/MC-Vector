import { invokePluginMetadata } from '../../plugin-metadata-ipc';

export interface SpigetResourceAdapter {
  id: number;
  name: string;
  tag: string;
  downloads: number;
  premium: boolean;
  external: boolean;
  iconUrl?: string;
  authorName?: string;
  fileType?: string;
  latestVersionId?: number;
  supportedVersions: string[];
  compatibility: 'compatible' | 'incompatible' | 'unknown';
}

export interface SpigotSearchParams {
  query: string;
  page: number;
  size: number;
  signal?: AbortSignal;
  minecraftVersion?: string;
}

export async function searchSpigotResources(
  params: SpigotSearchParams,
): Promise<SpigetResourceAdapter[]> {
  const { query, page, size, signal, minecraftVersion } = params;
  return invokePluginMetadata(
    'search_plugin_spiget',
    { query, page, size, ...(minecraftVersion === undefined ? {} : { minecraftVersion }) },
    signal,
  );
}
