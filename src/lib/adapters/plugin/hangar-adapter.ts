import { asNumber, asString, isRecord } from '../../guards/json-guards';
import { fetchJson } from './http-client';
import type { PluginSourceAdapter } from './source-adapter';

export interface HangarProjectAdapter {
  name: string;
  namespace: { owner: string; slug: string };
  stats: { downloads: number; stars: number };
  description: string;
  avatarUrl: string;
}

interface HangarSearchResponse {
  result: unknown[];
  pagination: unknown;
}

export interface HangarSearchParams {
  query: string;
  offset: number;
  limit: number;
}

export interface HangarSearchResult {
  result: HangarProjectAdapter[];
  pagination: unknown;
}

function parseHangarProject(project: unknown): HangarProjectAdapter | null {
  if (!isRecord(project)) {
    return null;
  }

  const namespaceRaw = isRecord(project.namespace) ? project.namespace : null;
  const statsRaw = isRecord(project.stats) ? project.stats : null;

  const owner = asString(namespaceRaw?.owner);
  const slug = asString(namespaceRaw?.slug);
  const name = asString(project.name);

  if (!owner || !slug || !name) {
    return null;
  }

  return {
    name,
    namespace: {
      owner,
      slug,
    },
    stats: {
      downloads: asNumber(statsRaw?.downloads),
      stars: asNumber(statsRaw?.stars),
    },
    description: asString(project.description),
    avatarUrl: asString(project.avatarUrl),
  };
}

const hangarSearchAdapter: PluginSourceAdapter<HangarSearchParams, HangarSearchResult> = {
  async search(params) {
    const url = new URL('https://hangar.papermc.io/api/v1/projects');
    url.searchParams.set('query', params.query);
    url.searchParams.set('offset', String(params.offset));
    url.searchParams.set('limit', String(params.limit));

    const payload = await fetchJson<HangarSearchResponse>(url.toString());
    const result = Array.isArray(payload.result)
      ? payload.result
          .map(parseHangarProject)
          .filter((project): project is HangarProjectAdapter => project !== null)
      : [];

    return {
      result,
      pagination: payload.pagination,
    };
  },
};

export async function searchHangarProjects(
  params: HangarSearchParams,
): Promise<HangarSearchResult> {
  return hangarSearchAdapter.search(params);
}
