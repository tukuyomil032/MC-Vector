import type {
  HangarProject,
  ModrinthProject,
  PluginCompatibility,
  SpigetResource,
} from '../../../lib/plugin-commands';

export type BrowserPlatform = 'Modrinth' | 'Hangar' | 'CurseForge' | 'Spigot';

export interface ProjectItem {
  id: string;
  title: string;
  description: string;
  author: string;
  icon_url?: string;
  downloads?: number;
  stars?: number;
  platform: 'Modrinth' | 'Hangar' | 'Spigot';
  slug?: string;
  source_obj: Record<string, unknown>;
  compatibility?: PluginCompatibility;
  supportedVersions?: string[];
}

export const LIMIT = 25;
export const ASYNC_CHECK_CONCURRENCY = 4;

export type CompatibilityStatus = 'checking' | PluginCompatibility;
export type UpdateStatus = 'checking' | 'update-available' | 'up-to-date' | 'unknown';
export type SortMode = 'relevance' | 'downloads' | 'name' | 'compatibility';
export type BrowserSection = 'browse' | 'installed';

export type CompatibilityDetail = {
  supportedVersions: string[];
};

export type DetailTab = 'info' | 'readme';

export interface InstalledPluginEntry {
  fileName: string;
  normalizedFileName: string;
  displayName: string;
  description: string;
  iconUrl?: string;
  state: 'enabled' | 'disabled';
  fileVersion: string;
  minecraftVersions: string[];
  sourceItem: ProjectItem | null;
  actionItem: ProjectItem;
}

const MINECRAFT_VERSION_REGEX = /\b1\.\d+(?:\.\d+)?\b/g;
const LOADER_KEYWORDS = [
  'paper',
  'spigot',
  'bukkit',
  'velocity',
  'waterfall',
  'fabric',
  'forge',
  'neoforge',
];

export function toSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'plugin';
}

export function extractVersionHints(text: string): string[] {
  const matches = text.match(MINECRAFT_VERSION_REGEX);
  if (!matches) {
    return [];
  }

  return Array.from(new Set(matches));
}

export function extractLoaderHintsFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const hints = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => {
      const lower = entry.toLowerCase();
      return LOADER_KEYWORDS.some((keyword) => lower.includes(keyword));
    });

  return Array.from(new Set(hints));
}

export function isDisabledPluginFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.disabled');
}

export function normalizeInstalledPluginFileName(fileName: string): string {
  return fileName.toLowerCase().replace(/\.disabled$/i, '');
}

export function collectPluginFileNames(
  entries: Array<{ name: string; isDirectory: boolean }>,
): string[] {
  return entries
    .filter((entry) => {
      if (entry.isDirectory) {
        return false;
      }
      const lower = entry.name.toLowerCase();
      return lower.endsWith('.jar') || lower.endsWith('.jar.disabled');
    })
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export function stripInstalledPluginFile(fileName: string): string {
  return fileName.replace(/\.disabled$/i, '').replace(/\.[^.]+$/, '');
}

export function inferInstalledFileVersion(fileName: string): string {
  const baseName = stripInstalledPluginFile(fileName);
  const versionMatch = baseName.match(
    /(?:^|[-_ ])v?(\d+(?:\.\d+){0,4}(?:[-+._]?(?:alpha|beta|rc|snapshot|pre)?\d*)?)/i,
  );
  return versionMatch?.[1] ?? '';
}

export function formatInstalledTitle(fileName: string): string {
  const baseName = stripInstalledPluginFile(fileName);
  return baseName.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isLikelyVersionSuffix(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  // Direct version suffixes (e.g. "-1.2.3", "v2.0", "1.20.4")
  if (/^[-_.\s]*v?\d/i.test(trimmed)) {
    return true;
  }

  // Classifier + version suffixes (e.g. "-bukkit-7.4.3-beta-01")
  if (!/^[-_.\s]+/.test(trimmed)) {
    return false;
  }

  const withoutLeadingSeparator = trimmed.replace(/^[-_.\s]+/, '');
  if (!withoutLeadingSeparator) {
    return true;
  }

  return /^(?:[a-z][a-z0-9]{1,31}[-_.\s]+){1,3}v?\d[\w.+-]*$/i.test(withoutLeadingSeparator);
}

export function buildInstalledMetadataLookupCandidates(fileName: string): string[] {
  const baseName = stripInstalledPluginFile(fileName).trim();
  if (!baseName) {
    return [];
  }

  const versionStrippedBase = baseName.replace(/(?:[-_.\s]+v?\d[\w.+-]*)$/i, '').trim();
  const candidates = [baseName];

  if (versionStrippedBase && versionStrippedBase.toLowerCase() !== baseName.toLowerCase()) {
    candidates.push(versionStrippedBase);

    // "name-classifier-version" -> include "name" as a broader lookup fallback.
    const classifierParts = versionStrippedBase.split(/[-_.\s]+/).filter(Boolean);
    if (classifierParts.length >= 2) {
      const classifierStrippedBase = classifierParts.slice(0, -1).join('-').trim();
      if (classifierStrippedBase) {
        candidates.push(classifierStrippedBase);
      }
    }
  }

  return Array.from(
    new Set(candidates.map((candidate) => candidate.replace(/\s+/g, ' ').trim()).filter(Boolean)),
  );
}

export function mapModrinthProject(hit: ModrinthProject): ProjectItem | null {
  const id = hit.project_id || hit.slug;
  if (!id) {
    return null;
  }

  return {
    id,
    title: hit.title,
    description: hit.description,
    // Empty means "unknown"; the card shows the translated fallback.
    author: hit.author || '',
    icon_url: hit.icon_url || undefined,
    downloads: hit.downloads || undefined,
    slug: hit.slug || hit.project_id || '',
    platform: 'Modrinth',
    compatibility: hit.compatibility,
    supportedVersions: hit.supportedVersions,
    source_obj: {
      ...hit,
    },
  };
}

export function mapHangarProject(project: HangarProject): ProjectItem {
  return {
    id: `${project.namespace.owner}/${project.namespace.slug}`,
    title: project.name,
    description: project.description,
    author: project.namespace.owner,
    icon_url: project.avatarUrl || undefined,
    stars: project.stats.stars || undefined,
    downloads: project.stats.downloads || undefined,
    slug: project.namespace.slug,
    platform: 'Hangar',
    source_obj: {
      ...project,
    },
  };
}

export function mapSpigotResource(resource: SpigetResource): ProjectItem {
  return {
    id: String(resource.id),
    title: resource.name,
    description: resource.tag || '',
    author: resource.authorName || '',
    icon_url: resource.iconUrl,
    downloads: resource.downloads,
    slug: toSlug(resource.name),
    platform: 'Spigot',
    compatibility: resource.compatibility,
    supportedVersions: resource.supportedVersions,
    source_obj: {
      ...resource,
    },
  };
}

function stripHtmlToText(value: string): string {
  try {
    const parsed = new DOMParser().parseFromString(value, 'text/html');
    const text = parsed.body.textContent || '';
    return text.replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return value;
  }
}

export function normalizeReadme(platform: ProjectItem['platform'], value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return '';
  }
  return platform === 'Spigot' ? stripHtmlToText(normalized) : normalized;
}

export function projectPageUrl(item: ProjectItem): string {
  if (item.platform === 'Modrinth') {
    return `https://modrinth.com/project/${item.slug || item.id}`;
  }
  if (item.platform === 'Hangar') {
    const slug = item.slug || toSlug(item.title);
    return `https://hangar.papermc.io/${encodeURIComponent(item.author)}/${encodeURIComponent(slug)}`;
  }
  return `https://www.spigotmc.org/resources/${item.id}/`;
}

const ALLOWED_PLUGIN_BROWSER_HOSTS = new Set([
  'modrinth.com',
  'hangar.papermc.io',
  'www.spigotmc.org',
  'www.curseforge.com',
]);

export function isAllowedPluginBrowserUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      ALLOWED_PLUGIN_BROWSER_HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  const results: R[] = [];
  let cursor = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
