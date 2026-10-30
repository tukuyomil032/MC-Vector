import type { PluginCompatibility } from '../../plugin-commands';
import { invokePluginMetadata } from '../../plugin-metadata-ipc';

export interface ModrinthProjectSearchHit {
  slug: string;
  project_id?: string;
  title: string;
  description: string;
  author?: string;
  icon_url: string;
  downloads: number;
  project_type: string;
  compatibility: PluginCompatibility;
  supportedVersions: string[];
}

export interface ModrinthSearchParams {
  query: string;
  facets: string;
  offset: number;
  limit: number;
  signal?: AbortSignal;
  minecraftVersion?: string;
}

export interface ModrinthSearchResult {
  hits: ModrinthProjectSearchHit[];
  total_hits: number;
}

export async function searchModrinthProjects(
  params: ModrinthSearchParams,
): Promise<ModrinthSearchResult> {
  const { query, facets, offset, limit, signal, minecraftVersion } = params;
  return invokePluginMetadata(
    'search_plugin_modrinth',
    {
      query,
      facets,
      offset,
      limit,
      ...(minecraftVersion === undefined ? {} : { minecraftVersion }),
    },
    signal,
  );
}
