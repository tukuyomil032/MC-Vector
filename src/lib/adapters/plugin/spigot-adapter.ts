import { asNumber, asString, isRecord } from '../../guards/json-guards';
import { fetchJson } from './http-client';
import type { PluginSourceAdapter } from './source-adapter';

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
}

export interface SpigotSearchParams {
  query: string;
  page: number;
  size: number;
}

function toSpigotIconUrl(iconPath: string): string {
  if (!iconPath) {
    return '';
  }
  if (/^https?:\/\//i.test(iconPath)) {
    return iconPath;
  }
  return `https://www.spigotmc.org/${iconPath.replace(/^\/+/, '')}`;
}

function parseSpigetResource(resource: unknown): SpigetResourceAdapter | null {
  if (!isRecord(resource)) {
    return null;
  }

  const id = asNumber(resource.id, -1);
  const name = asString(resource.name);
  if (id < 0 || !name) {
    return null;
  }

  const iconRaw = isRecord(resource.icon) ? resource.icon : null;
  const authorRaw = isRecord(resource.author) ? resource.author : null;
  const fileRaw = isRecord(resource.file) ? resource.file : null;
  const fileUrl = fileRaw ? asString(fileRaw.url) : '';
  const versionMatch = fileUrl.match(/[?&]version=(\d+)/);
  const latestVersionId = versionMatch ? Number(versionMatch[1]) : undefined;

  return {
    id,
    name,
    tag: asString(resource.tag),
    downloads: asNumber(resource.downloads),
    premium: Boolean(resource.premium),
    external: Boolean(resource.external),
    iconUrl: iconRaw ? toSpigotIconUrl(asString(iconRaw.url)) || undefined : undefined,
    authorName: authorRaw ? asString(authorRaw.name) || undefined : undefined,
    fileType: fileRaw ? asString(fileRaw.type) || undefined : undefined,
    latestVersionId,
  };
}

const spigotSearchAdapter: PluginSourceAdapter<SpigotSearchParams, SpigetResourceAdapter[]> = {
  async search(params) {
    const trimmed = params.query.trim();
    const url = new URL(
      trimmed
        ? `https://api.spiget.org/v2/search/resources/${encodeURIComponent(trimmed)}`
        : 'https://api.spiget.org/v2/resources/free',
    );
    url.searchParams.set('size', String(params.size));
    url.searchParams.set('page', String(Math.max(1, params.page)));
    url.searchParams.set('sort', '-downloads');

    const resources = await fetchJson<unknown[]>(url.toString(), {
      headers: {
        'User-Agent': 'MC-Vector/2.0',
      },
    });

    return resources
      .map(parseSpigetResource)
      .filter((resource): resource is SpigetResourceAdapter => resource !== null);
  },
};

export async function searchSpigotResources(
  params: SpigotSearchParams,
): Promise<SpigetResourceAdapter[]> {
  return spigotSearchAdapter.search(params);
}
