import { invokePluginMetadata } from '../../plugin-metadata-ipc';

export interface HangarProjectAdapter {
  name: string;
  namespace: { owner: string; slug: string };
  stats: { downloads: number; stars: number };
  description: string;
  avatarUrl: string;
}

export interface HangarSearchParams {
  query: string;
  offset: number;
  limit: number;
  signal?: AbortSignal;
}

export interface HangarSearchResult {
  result: HangarProjectAdapter[];
  pagination: unknown;
}

export async function searchHangarProjects(
  params: HangarSearchParams,
): Promise<HangarSearchResult> {
  const { query, offset, limit, signal } = params;
  return invokePluginMetadata('search_plugin_hangar', { query, offset, limit }, signal);
}
