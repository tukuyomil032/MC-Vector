import { fetchJson } from './http-client';
import type { PluginSourceAdapter } from './source-adapter';

export interface ModrinthProjectSearchHit {
  slug: string;
  project_id?: string;
  title: string;
  description: string;
  author?: string;
  icon_url: string;
  downloads: number;
  project_type: string;
}

export interface ModrinthSearchParams {
  query: string;
  facets: string;
  offset: number;
  limit: number;
}

export interface ModrinthSearchResult {
  hits: ModrinthProjectSearchHit[];
  total_hits: number;
}

const modrinthSearchAdapter: PluginSourceAdapter<ModrinthSearchParams, ModrinthSearchResult> = {
  async search(params) {
    const url = new URL('https://api.modrinth.com/v2/search');
    url.searchParams.set('query', params.query);
    url.searchParams.set('offset', String(params.offset));
    url.searchParams.set('limit', String(params.limit));
    if (params.facets) {
      url.searchParams.set('facets', params.facets);
    }

    return fetchJson<ModrinthSearchResult>(url.toString());
  },
};

export async function searchModrinthProjects(
  params: ModrinthSearchParams,
): Promise<ModrinthSearchResult> {
  return modrinthSearchAdapter.search(params);
}
