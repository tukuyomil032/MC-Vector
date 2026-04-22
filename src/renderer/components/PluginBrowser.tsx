import { ask } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  ExternalLink,
  Flame,
  Loader2,
  type LucideIcon,
  Package,
  Search,
  Server,
  Star,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import paperLogoUrl from '../../assets/papermc_logo.svg';
import { useTranslation } from '../../i18n';
import { logError } from '../../lib/error-utils';
import { deleteItem, listFiles, moveItem } from '../../lib/file-commands';
import {
  checkHangarCompatibility,
  getCompatibleModrinthVersion,
  getHangarProjectBody,
  getModrinthProjectBody,
  getModrinthProjectIdentity,
  getModrinthVersionById,
  getSpigotResourceBody,
  installHangarProject,
  installModrinthProject,
  installSpigotProject,
  type HangarProject,
  type ModrinthProject,
  type ModrinthProjectIdentity,
  resolveHangarDownload,
  type SpigetResource,
  searchHangar,
  searchModrinth,
  searchSpigot,
} from '../../lib/plugin-commands';
import { type MinecraftServer } from '../components/../shared/server declaration';
import { useToast } from './ToastProvider';

interface Props {
  server: MinecraftServer;
}

type BrowserPlatform = 'Modrinth' | 'Hangar' | 'CurseForge' | 'Spigot';

interface ProjectItem {
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
}

interface PlatformOption {
  key: BrowserPlatform;
  label: string;
  hint: string;
  inApp: boolean;
  icon: LucideIcon;
  logoUrl: string;
}

const LIMIT = 25;
const ASYNC_CHECK_CONCURRENCY = 4;

type CompatibilityStatus = 'checking' | 'compatible' | 'incompatible' | 'unknown';
type UpdateStatus = 'checking' | 'update-available' | 'up-to-date' | 'unknown';
type SortMode = 'relevance' | 'downloads' | 'name' | 'compatibility';
type BrowserSection = 'browse' | 'installed';

type CompatibilityDetail = {
  supportedVersions: string[];
};

interface DependencyIdentity {
  projectId: string;
  slug: string;
  title: string;
}

interface RequiredDependencyPlan {
  projectId: string;
  versionId: string | null;
  fileName: string | null;
  identity: DependencyIdentity;
}

type DetailTab = 'info' | 'readme';

interface InstalledPluginEntry {
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

type InstalledFileResolution =
  | 'exact'
  | 'case-insensitive'
  | 'counterpart-exact'
  | 'counterpart-case-insensitive'
  | 'normalized-unique';

interface InstalledFileMatch {
  fileName: string;
  resolution: InstalledFileResolution;
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

function toSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'plugin';
}

function normalizeFileExtension(value?: string): string {
  if (!value) {
    return '.jar';
  }
  return value.startsWith('.') ? value : `.${value}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isPathMissingError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('no such file') ||
    message.includes('does not exist')
  );
}

function isAlreadyExistsError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes('already exists') ||
    message.includes('file exists') ||
    message.includes('os error 17') ||
    message.includes('cannot create a file when that file already exists')
  );
}

function normalizeServerVersion(version: string): string {
  const trimmed = version.trim();
  const parts = trimmed.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : trimmed;
}

function isCompatibleVersion(availableVersions: string[], serverVersion: string): boolean {
  if (!serverVersion.trim()) {
    return true;
  }
  if (availableVersions.length === 0) {
    return false;
  }

  const normalizedServer = serverVersion.trim();
  const normalizedMajorMinor = normalizeServerVersion(normalizedServer);

  return availableVersions.some((candidate) => {
    const value = candidate.trim();
    return value === normalizedServer || normalizeServerVersion(value) === normalizedMajorMinor;
  });
}

function extractVersionHints(text: string): string[] {
  const matches = text.match(MINECRAFT_VERSION_REGEX);
  if (!matches) {
    return [];
  }

  return Array.from(new Set(matches));
}

function extractLoaderHintsFromUnknown(value: unknown): string[] {
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

function isDisabledPluginFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.disabled');
}

function normalizeInstalledPluginFileName(fileName: string): string {
  return fileName.toLowerCase().replace(/\.disabled$/i, '');
}

function togglePluginFileName(fileName: string): string {
  return isDisabledPluginFile(fileName)
    ? fileName.replace(/\.disabled$/i, '')
    : `${fileName}.disabled`;
}

function toListedPluginFileName(value: string): string {
  const normalized = value.replace(/\\/g, '/').trim();
  if (!normalized) {
    return '';
  }
  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : normalized;
}

function collectPluginFileNames(entries: Array<{ name: string; isDirectory: boolean }>): string[] {
  return entries
    .filter((entry) => {
      if (entry.isDirectory) {
        return false;
      }
      const lower = entry.name.toLowerCase();
      return lower.endsWith('.jar') || lower.endsWith('.jar.disabled');
    })
    .map((entry) => toListedPluginFileName(entry.name))
    .filter((name): name is string => Boolean(name))
    .sort((left, right) => left.localeCompare(right));
}

function resolveInstalledFileMatch(
  files: string[],
  requestedFile: string,
  options?: { allowCounterpart?: boolean },
): InstalledFileMatch | null {
  const requested = toListedPluginFileName(requestedFile);
  if (!requested) {
    return null;
  }

  const findCaseInsensitiveMatches = (targetName: string): string[] => {
    const normalizedTarget = targetName.toLowerCase();
    return files.filter((candidate) => candidate.toLowerCase() === normalizedTarget);
  };

  if (files.includes(requested)) {
    return { fileName: requested, resolution: 'exact' };
  }

  const caseInsensitiveMatches = findCaseInsensitiveMatches(requested);
  if (caseInsensitiveMatches.length === 1) {
    return { fileName: caseInsensitiveMatches[0], resolution: 'case-insensitive' };
  }
  if (caseInsensitiveMatches.length > 1) {
    throw new Error(
      `Ambiguous case-insensitive installed file matches: ${caseInsensitiveMatches.join(', ')}`,
    );
  }

  const allowCounterpart = options?.allowCounterpart ?? true;
  if (allowCounterpart) {
    const counterpartFile = togglePluginFileName(requested);
    if (files.includes(counterpartFile)) {
      return { fileName: counterpartFile, resolution: 'counterpart-exact' };
    }

    const caseInsensitiveCounterpartMatches = findCaseInsensitiveMatches(counterpartFile);
    if (caseInsensitiveCounterpartMatches.length === 1) {
      return {
        fileName: caseInsensitiveCounterpartMatches[0],
        resolution: 'counterpart-case-insensitive',
      };
    }
    if (caseInsensitiveCounterpartMatches.length > 1) {
      throw new Error(
        `Ambiguous case-insensitive counterpart matches: ${caseInsensitiveCounterpartMatches.join(', ')}`,
      );
    }
  }

  const normalizedMatches = files.filter(
    (candidate) =>
      normalizeInstalledPluginFileName(candidate) === normalizeInstalledPluginFileName(requested),
  );
  if (normalizedMatches.length === 1) {
    return { fileName: normalizedMatches[0], resolution: 'normalized-unique' };
  }
  if (normalizedMatches.length > 1) {
    throw new Error(`Ambiguous normalized installed file matches: ${normalizedMatches.join(', ')}`);
  }

  return null;
}

function stripInstalledPluginFile(fileName: string): string {
  return fileName.replace(/\.disabled$/i, '').replace(/\.[^.]+$/, '');
}

function inferInstalledFileVersion(fileName: string): string {
  const baseName = stripInstalledPluginFile(fileName);
  const versionMatch = baseName.match(
    /(?:^|[-_ ])v?(\d+(?:\.\d+){0,4}(?:[-+._]?(?:alpha|beta|rc|snapshot|pre)?\d*)?)/i,
  );
  return versionMatch?.[1] ?? '';
}

function formatInstalledTitle(fileName: string): string {
  const baseName = stripInstalledPluginFile(fileName);
  return baseName.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isLikelyVersionSuffix(value: string): boolean {
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

function buildInstalledMetadataLookupCandidates(fileName: string): string[] {
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

function mapModrinthProject(hit: ModrinthProject): ProjectItem | null {
  const id = hit.project_id || hit.slug;
  if (!id) {
    return null;
  }

  return {
    id,
    title: hit.title,
    description: hit.description,
    author: hit.author || 'Unknown',
    icon_url: hit.icon_url || undefined,
    downloads: hit.downloads || undefined,
    slug: hit.slug || hit.project_id || '',
    platform: 'Modrinth',
    source_obj: {
      ...hit,
    },
  };
}

function mapHangarProject(project: HangarProject): ProjectItem {
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

function mapSpigotResource(resource: SpigetResource): ProjectItem {
  return {
    id: String(resource.id),
    title: resource.name,
    description: resource.tag || 'No description provided.',
    author: resource.authorName || 'Unknown',
    icon_url: resource.iconUrl,
    downloads: resource.downloads,
    slug: toSlug(resource.name),
    platform: 'Spigot',
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

function normalizeReadme(platform: ProjectItem['platform'], value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return '';
  }
  return platform === 'Spigot' ? stripHtmlToText(normalized) : normalized;
}

function projectPageUrl(item: ProjectItem): string {
  if (item.platform === 'Modrinth') {
    return `https://modrinth.com/project/${item.slug || item.id}`;
  }
  if (item.platform === 'Hangar') {
    const slug = item.slug || toSlug(item.title);
    return `https://hangar.papermc.io/${encodeURIComponent(item.author)}/${encodeURIComponent(slug)}`;
  }
  return `https://www.spigotmc.org/resources/${item.id}/`;
}

async function mapWithConcurrency<T, R>(
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

export default function PluginBrowser({ server }: Props) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const [activeSection, setActiveSection] = useState<BrowserSection>('browse');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [pageInput, setPageInput] = useState('1');
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [logoLoadFailed, setLogoLoadFailed] = useState<Record<string, boolean>>({});
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<ProjectItem | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('info');
  const [detailReadme, setDetailReadme] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [installedFiles, setInstalledFiles] = useState<string[]>([]);
  const [knownItemsByInstalledFile, setKnownItemsByInstalledFile] = useState<
    Record<string, ProjectItem>
  >({});
  const [busyInstalledFile, setBusyInstalledFile] = useState<string | null>(null);
  const [dupDialog, setDupDialog] = useState<{ item: ProjectItem; installedFile: string } | null>(
    null,
  );
  const [page, setPage] = useState(0);
  const [compatibilityByItemId, setCompatibilityByItemId] = useState<
    Record<string, CompatibilityStatus>
  >({});
  const [compatibilityDetailByItemId, setCompatibilityDetailByItemId] = useState<
    Record<string, CompatibilityDetail>
  >({});
  const [updateStatusByItemId, setUpdateStatusByItemId] = useState<Record<string, UpdateStatus>>(
    {},
  );
  const [latestFileByItemId, setLatestFileByItemId] = useState<Record<string, string>>({});
  const dependencyIdentityCacheRef = useRef<Record<string, DependencyIdentity>>({});
  const detailReadmeCacheRef = useRef<Record<string, string | null>>({});
  const updateStatusCacheRef = useRef<
    Record<string, { status: UpdateStatus; latestFileName: string | null }>
  >({});
  const installedMetadataLookupStateRef = useRef<Record<string, 'resolved' | 'miss'>>({});
  const detailRequestIdRef = useRef(0);
  const compatibilityRequestIdRef = useRef(0);
  const updateStatusRequestIdRef = useRef(0);

  const isModServer = ['Fabric', 'Forge', 'NeoForge'].includes(server.software || '');
  const [platform, setPlatform] = useState<BrowserPlatform>('Modrinth');
  const isPaper = ['Paper', 'LeafMC', 'Waterfall', 'Velocity'].includes(server.software || '');
  const { showToast } = useToast();
  const folderName = isModServer ? 'mods' : 'plugins';
  const tSafe = (
    key: Parameters<typeof t>[0],
    fallback: string,
    params?: Parameters<typeof t>[1],
  ): string => {
    const translated = t(key, params);
    return translated === key ? fallback : translated;
  };

  const platformOptions = useMemo<PlatformOption[]>(() => {
    const options: PlatformOption[] = [
      {
        key: 'Modrinth',
        label: 'Modrinth',
        hint: isModServer ? 'Mods + Datapacks' : 'Plugins + Mods',
        inApp: true,
        icon: Package,
        logoUrl: 'https://modrinth.com/favicon.ico',
      },
    ];

    if (isPaper) {
      options.push({
        key: 'Hangar',
        label: 'Hangar',
        hint: 'Paper ecosystem',
        inApp: true,
        icon: Server,
        logoUrl: paperLogoUrl,
      });
    }

    if (!isModServer) {
      options.push({
        key: 'Spigot',
        label: 'SpigotMC',
        hint: 'Spiget API',
        inApp: true,
        icon: Flame,
        logoUrl: 'https://www.spigotmc.org/favicon.ico',
      });
    }

    if (isModServer) {
      options.push({
        key: 'CurseForge',
        label: 'CurseForge',
        hint: 'Open in web',
        inApp: false,
        icon: ExternalLink,
        logoUrl: 'https://www.curseforge.com/favicon.ico',
      });
    }

    return options;
  }, [isModServer, isPaper]);

  useEffect(() => {
    if (!platformOptions.some((option) => option.key === platform)) {
      setPlatform(platformOptions[0]?.key ?? 'Modrinth');
      setPage(0);
    }
  }, [platform, platformOptions]);

  const selectedPlatform =
    platformOptions.find((option) => option.key === platform) ?? platformOptions[0];
  const isInAppSearch = selectedPlatform?.inApp ?? false;
  const searchPlatformLabel =
    (selectedPlatform?.label || platform || 'Modrinth').trim() || 'Modrinth';

  const refreshInstalled = async () => {
    try {
      const dirPath = `${server.path}/${folderName}`;
      const entries = await listFiles(dirPath);
      const nextInstalledFiles = collectPluginFileNames(entries);
      setInstalledFiles(nextInstalledFiles);
    } catch (error) {
      logError('Failed to refresh installed plugin list', error, {
        serverId: server.id,
        pluginDir: `${server.path}/${folderName}`,
      });
      setInstalledFiles([]);
    }
  };

  useEffect(() => {
    if (activeSection !== 'browse') {
      setLoading(false);
      return;
    }

    if (isInAppSearch) {
      void search();
      return;
    }

    setLoading(false);
    setHasNextPage(false);
    setTotalPages(null);
    setResults([]);
  }, [activeSection, page, platform, isInAppSearch]);

  useEffect(() => {
    setPageInput(String(page + 1));
  }, [page]);

  useEffect(() => {
    void refreshInstalled();
    setKnownItemsByInstalledFile({});
    installedMetadataLookupStateRef.current = {};
  }, [server.id, server.path, isModServer]);

  useEffect(() => {
    let cancelled = false;
    const requestId = compatibilityRequestIdRef.current + 1;
    compatibilityRequestIdRef.current = requestId;

    if (!isInAppSearch || results.length === 0) {
      setCompatibilityByItemId({});
      setCompatibilityDetailByItemId({});
      return;
    }

    const initial: Record<string, CompatibilityStatus> = {};
    const initialDetails: Record<string, CompatibilityDetail> = {};
    for (const item of results) {
      if (item.platform === 'Modrinth') {
        initial[item.id] = 'compatible';
        initialDetails[item.id] = { supportedVersions: [server.version] };
      } else if (item.platform === 'Spigot') {
        initial[item.id] = inferSpigotCompatibility(item);
        initialDetails[item.id] = {
          supportedVersions: extractVersionHints(
            `${item.description} ${typeof item.source_obj.tag === 'string' ? item.source_obj.tag : ''}`,
          ),
        };
      } else {
        initial[item.id] = 'checking';
        initialDetails[item.id] = { supportedVersions: [] };
      }
    }
    setCompatibilityByItemId(initial);
    setCompatibilityDetailByItemId(initialDetails);

    const run = async () => {
      const updates = await mapWithConcurrency(
        results,
        ASYNC_CHECK_CONCURRENCY,
        async (item): Promise<[string, CompatibilityStatus, CompatibilityDetail]> => {
          if (cancelled || compatibilityRequestIdRef.current !== requestId) {
            return [item.id, initial[item.id] ?? 'unknown', initialDetails[item.id]];
          }

          if (item.platform !== 'Hangar') {
            return [item.id, initial[item.id] ?? 'unknown', initialDetails[item.id]];
          }

          try {
            const compatibility = await checkHangarCompatibility({
              owner: item.author,
              slug: item.slug || item.title,
              software: server.software || 'Paper',
              minecraftVersion: server.version || '',
            });

            if (compatibility.supportedVersions.length === 0) {
              return [item.id, 'unknown', { supportedVersions: [] }];
            }

            return [
              item.id,
              compatibility.compatible ? 'compatible' : 'incompatible',
              {
                supportedVersions: compatibility.supportedVersions,
              },
            ];
          } catch (error) {
            logError('Failed to check Hangar compatibility', error, {
              itemId: item.id,
              itemTitle: item.title,
            });
            return [item.id, 'unknown', { supportedVersions: [] }];
          }
        },
      );

      if (cancelled || compatibilityRequestIdRef.current !== requestId) {
        return;
      }

      const next: Record<string, CompatibilityStatus> = { ...initial };
      const nextDetails: Record<string, CompatibilityDetail> = { ...initialDetails };
      for (const [id, status, detail] of updates) {
        next[id] = status;
        nextDetails[id] = detail;
      }
      setCompatibilityByItemId(next);
      setCompatibilityDetailByItemId(nextDetails);
    };

    void run();

    return () => {
      cancelled = true;
      if (compatibilityRequestIdRef.current === requestId) {
        compatibilityRequestIdRef.current += 1;
      }
    };
  }, [isInAppSearch, results, server.software, server.version]);

  useEffect(() => {
    let cancelled = false;
    const requestId = updateStatusRequestIdRef.current + 1;
    updateStatusRequestIdRef.current = requestId;

    if (!isInAppSearch || results.length === 0) {
      setUpdateStatusByItemId({});
      setLatestFileByItemId({});
      return;
    }

    const installedTargets = results
      .map((item) => {
        const installedMatch = findInstalledMatchStrict(item);
        return installedMatch ? { item, installedMatch } : null;
      })
      .filter((entry): entry is { item: ProjectItem; installedMatch: string } => entry !== null);

    const initialStatus: Record<string, UpdateStatus> = {};
    for (const target of installedTargets) {
      initialStatus[target.item.id] = target.item.platform === 'Spigot' ? 'unknown' : 'checking';
    }

    setUpdateStatusByItemId(initialStatus);
    setLatestFileByItemId({});

    if (installedTargets.length === 0) {
      return;
    }

    const run = async () => {
      const updates = await mapWithConcurrency(
        installedTargets,
        ASYNC_CHECK_CONCURRENCY,
        async ({ item, installedMatch }): Promise<[string, UpdateStatus, string | null]> => {
          if (cancelled || updateStatusRequestIdRef.current !== requestId) {
            return [item.id, initialStatus[item.id] ?? 'unknown', null];
          }

          if (item.platform === 'Spigot') {
            return [item.id, 'unknown', null];
          }

          const normalizedInstalled = normalizeInstalledPluginFileName(installedMatch);
          const cacheKey = `${item.platform}:${item.id}:${server.software}:${server.version}:${normalizedInstalled}`;
          const cached = updateStatusCacheRef.current[cacheKey];
          if (cached) {
            return [item.id, cached.status, cached.latestFileName];
          }

          try {
            let latestFileName: string | null = null;

            if (item.platform === 'Modrinth') {
              const loader = (server.software || '').toLowerCase();
              const resolved = await getCompatibleModrinthVersion({
                projectId: item.id,
                loader,
                minecraftVersion: server.version,
              });
              latestFileName = resolved?.fileName ?? null;
            } else {
              const owner = item.author;
              const slug = item.slug || item.title;
              const resolved = await resolveHangarDownload({
                owner,
                slug,
                software: server.software || 'Paper',
                minecraftVersion: server.version || '',
              });
              latestFileName = resolved?.fileName ?? null;
            }

            const status: UpdateStatus = latestFileName
              ? normalizedInstalled === latestFileName.toLowerCase()
                ? 'up-to-date'
                : 'update-available'
              : 'unknown';

            updateStatusCacheRef.current[cacheKey] = {
              status,
              latestFileName,
            };

            return [item.id, status, latestFileName];
          } catch (error) {
            logError('Failed to resolve plugin update status', error, {
              itemId: item.id,
              cacheKey,
            });
            return [item.id, 'unknown', null];
          }
        },
      );

      if (cancelled || updateStatusRequestIdRef.current !== requestId) {
        return;
      }

      const nextStatus: Record<string, UpdateStatus> = { ...initialStatus };
      const nextLatest: Record<string, string> = {};

      for (const [id, status, latestFileName] of updates) {
        nextStatus[id] = status;
        if (latestFileName) {
          nextLatest[id] = latestFileName;
        }
      }

      setUpdateStatusByItemId(nextStatus);
      setLatestFileByItemId(nextLatest);
    };

    void run();

    return () => {
      cancelled = true;
      if (updateStatusRequestIdRef.current === requestId) {
        updateStatusRequestIdRef.current += 1;
      }
    };
  }, [isInAppSearch, results, installedFiles, server.software, server.version]);

  const normalize = (text?: unknown) =>
    String(text ?? '')
      .toLowerCase()
      .replace(/\.disabled$/g, '')
      .replace(/\.jar$/g, '')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]/g, '');

  const isCandidateInstalled = (candidate: string): boolean => {
    const normalizedCandidate = normalize(candidate);
    const plainCandidate = String(candidate ?? '')
      .trim()
      .toLowerCase();
    if (!normalizedCandidate) {
      return false;
    }

    return installedFiles.some((file) => {
      const normalizedFile = normalize(file);
      if (normalizedFile === normalizedCandidate) {
        return true;
      }

      if (!plainCandidate) {
        return false;
      }

      const fileBase = file
        .toLowerCase()
        .replace(/\.disabled$/i, '')
        .replace(/\.[^.]+$/, '');
      if (fileBase === plainCandidate) {
        return true;
      }

      if (!fileBase.startsWith(plainCandidate)) {
        return false;
      }

      return isLikelyVersionSuffix(fileBase.slice(plainCandidate.length));
    });
  };

  const getItemCandidates = (item: ProjectItem) => {
    const normalizedCandidates = [
      item.slug,
      item.title,
      item.id,
      item.source_obj.slug,
      item.source_obj.project_id,
      item.source_obj.name,
      item.source_obj.id,
    ]
      .map(normalize)
      .filter(Boolean);

    const plainCandidates = [item.slug, item.title, item.source_obj.slug]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return {
      normalizedCandidates,
      plainCandidates,
    };
  };

  const matchItemAgainstInstalledFile = (
    item: ProjectItem,
    installedFileName: string,
  ): 'strict' | 'fallback' | null => {
    const { normalizedCandidates, plainCandidates } = getItemCandidates(item);
    const normalizedInstalled = normalize(installedFileName);

    if (normalizedCandidates.some((candidate) => normalizedInstalled === candidate)) {
      return 'strict';
    }

    const fileBase = installedFileName
      .toLowerCase()
      .replace(/\.disabled$/i, '')
      .replace(/\.[^.]+$/, '');

    if (plainCandidates.some((candidate) => fileBase === candidate)) {
      return 'strict';
    }

    const uniquePlainCandidates = Array.from(
      new Set(plainCandidates.map((value) => value.trim()).filter(Boolean)),
    );

    const fallbackCandidateMatches = uniquePlainCandidates.filter((candidate) => {
      if (!fileBase.startsWith(candidate)) {
        return false;
      }
      const suffix = fileBase.slice(candidate.length);
      return Boolean(suffix) && isLikelyVersionSuffix(suffix);
    });

    return fallbackCandidateMatches.length === 1 ? 'fallback' : null;
  };

  const pickUniqueMetadataCandidate = (
    candidates: Array<{ item: ProjectItem; confidence: 'strict' | 'fallback' }>,
  ): ProjectItem | null => {
    const strictCandidates = candidates.filter((candidate) => candidate.confidence === 'strict');
    if (strictCandidates.length === 1) {
      return strictCandidates[0].item;
    }

    if (strictCandidates.length > 1) {
      return null;
    }

    return candidates.length === 1 ? candidates[0].item : null;
  };

  const findInstalledMatchStrict = (item: ProjectItem) => {
    const strictMatches = installedFiles.filter(
      (fileName) => matchItemAgainstInstalledFile(item, fileName) === 'strict',
    );

    return strictMatches[0] ?? null;
  };

  const findInstalledMatchFallback = (item: ProjectItem) => {
    const fallbackMatches = installedFiles.filter(
      (fileName) => matchItemAgainstInstalledFile(item, fileName) === 'fallback',
    );

    return fallbackMatches.length === 1 ? fallbackMatches[0] : null;
  };

  const findInstalledMatchForMetadata = (
    item: ProjectItem,
  ): { fileName: string; confidence: 'strict' | 'fallback' } | null => {
    const strictMatch = findInstalledMatchStrict(item);
    if (strictMatch) {
      return { fileName: strictMatch, confidence: 'strict' };
    }

    const fallbackMatch = findInstalledMatchFallback(item);
    if (fallbackMatch) {
      return { fileName: fallbackMatch, confidence: 'fallback' };
    }

    return null;
  };

  const currentResultMatchesByInstalledFile = useMemo(() => {
    const candidatesByInstalledFile: Record<
      string,
      Array<{ item: ProjectItem; confidence: 'strict' | 'fallback' }>
    > = {};

    for (const item of results) {
      const match = findInstalledMatchForMetadata(item);
      if (!match) {
        continue;
      }
      const key = normalizeInstalledPluginFileName(match.fileName);
      if (!candidatesByInstalledFile[key]) {
        candidatesByInstalledFile[key] = [];
      }
      candidatesByInstalledFile[key].push({ item, confidence: match.confidence });
    }

    const next: Record<string, ProjectItem> = {};
    for (const [normalizedFileName, candidates] of Object.entries(candidatesByInstalledFile)) {
      const resolved = pickUniqueMetadataCandidate(candidates);
      if (resolved) {
        next[normalizedFileName] = resolved;
      }
    }

    return next;
  }, [results, installedFiles]);

  useEffect(() => {
    const nextKeys = Object.keys(currentResultMatchesByInstalledFile);
    if (nextKeys.length === 0) {
      return;
    }

    setKnownItemsByInstalledFile((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const key of nextKeys) {
        const item = currentResultMatchesByInstalledFile[key];
        if (!item || next[key]?.id === item.id) {
          continue;
        }
        next[key] = item;
        changed = true;
      }
      return changed ? next : previous;
    });
  }, [currentResultMatchesByInstalledFile]);

  useEffect(() => {
    let cancelled = false;

    const activeInstalledKeys = new Set(
      installedFiles.map((fileName) => normalizeInstalledPluginFileName(fileName)),
    );

    for (const key of Object.keys(installedMetadataLookupStateRef.current)) {
      if (!activeInstalledKeys.has(key)) {
        delete installedMetadataLookupStateRef.current[key];
      }
    }

    const pendingFiles = installedFiles.filter((fileName) => {
      const normalizedFileName = normalizeInstalledPluginFileName(fileName);
      if (
        currentResultMatchesByInstalledFile[normalizedFileName] ||
        knownItemsByInstalledFile[normalizedFileName]
      ) {
        installedMetadataLookupStateRef.current[normalizedFileName] = 'resolved';
        return false;
      }

      return !installedMetadataLookupStateRef.current[normalizedFileName];
    });

    if (pendingFiles.length === 0) {
      return;
    }

    const run = async () => {
      const resolvedEntries = await mapWithConcurrency(
        pendingFiles,
        ASYNC_CHECK_CONCURRENCY,
        async (fileName): Promise<[string, ProjectItem | null]> => {
          const normalizedFileName = normalizeInstalledPluginFileName(fileName);
          const lookupCandidates = buildInstalledMetadataLookupCandidates(fileName);

          if (lookupCandidates.length === 0) {
            installedMetadataLookupStateRef.current[normalizedFileName] = 'miss';
            return [normalizedFileName, null];
          }

          const candidates: Array<{ item: ProjectItem; confidence: 'strict' | 'fallback' }> = [];
          const seenItems = new Set<string>();
          let hadLookupFailure = false;

          for (const lookupQuery of lookupCandidates) {
            const lookups: Array<Promise<ProjectItem[]>> = [
              searchModrinth(
                lookupQuery,
                `[["project_type:${isModServer ? 'mod' : 'plugin'}"]]`,
                0,
                8,
              )
                .then((result) =>
                  result.hits
                    .map(mapModrinthProject)
                    .filter((item): item is ProjectItem => item !== null),
                )
                .catch(() => {
                  hadLookupFailure = true;
                  return [];
                }),
            ];

            if (isPaper) {
              lookups.push(
                searchHangar(lookupQuery, 0)
                  .then((result) => result.result.slice(0, 8).map(mapHangarProject))
                  .catch(() => {
                    hadLookupFailure = true;
                    return [];
                  }),
              );
            }

            if (!isModServer) {
              lookups.push(
                searchSpigot(lookupQuery, 1, 8)
                  .then((resources) => resources.map(mapSpigotResource))
                  .catch(() => {
                    hadLookupFailure = true;
                    return [];
                  }),
              );
            }

            const lookupResults = await Promise.all(lookups);

            for (const resultItems of lookupResults) {
              for (const item of resultItems) {
                const confidence = matchItemAgainstInstalledFile(item, fileName);
                if (!confidence) {
                  continue;
                }

                const key = `${item.platform}:${item.id}`;
                if (seenItems.has(key)) {
                  continue;
                }

                seenItems.add(key);
                candidates.push({ item, confidence });
              }
            }

            const matched = pickUniqueMetadataCandidate(candidates);
            if (matched) {
              installedMetadataLookupStateRef.current[normalizedFileName] = 'resolved';
              return [normalizedFileName, matched];
            }
          }

          const matched = pickUniqueMetadataCandidate(candidates);
          if (matched) {
            installedMetadataLookupStateRef.current[normalizedFileName] = 'resolved';
            return [normalizedFileName, matched];
          }

          if (!hadLookupFailure) {
            installedMetadataLookupStateRef.current[normalizedFileName] = 'miss';
          }

          return [normalizedFileName, null];
        },
      );

      if (cancelled) {
        return;
      }

      setKnownItemsByInstalledFile((previous) => {
        let changed = false;
        const next = { ...previous };

        for (const [normalizedFileName, item] of resolvedEntries) {
          if (!item || next[normalizedFileName]?.id === item.id) {
            continue;
          }

          next[normalizedFileName] = item;
          changed = true;
        }

        return changed ? next : previous;
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    currentResultMatchesByInstalledFile,
    installedFiles,
    isModServer,
    isPaper,
    knownItemsByInstalledFile,
  ]);

  const installedEntries = useMemo<InstalledPluginEntry[]>(() => {
    return installedFiles.map((fileName) => {
      const normalizedFileName = normalizeInstalledPluginFileName(fileName);
      const sourceItem =
        currentResultMatchesByInstalledFile[normalizedFileName] ??
        knownItemsByInstalledFile[normalizedFileName] ??
        null;
      const displayName = sourceItem?.title || formatInstalledTitle(fileName) || fileName;
      const description = sourceItem?.description?.trim() || t('plugins.browser.noDescription');

      const extractedVersions = sourceItem
        ? [
            ...(compatibilityDetailByItemId[sourceItem.id]?.supportedVersions ?? []),
            ...extractVersionHints(
              `${sourceItem.description} ${typeof sourceItem.source_obj.tag === 'string' ? sourceItem.source_obj.tag : ''}`,
            ),
          ]
        : [];
      const minecraftVersions = Array.from(
        new Set(extractedVersions.map((version) => version.trim()).filter(Boolean)),
      );
      if (minecraftVersions.length === 0 && server.version.trim()) {
        minecraftVersions.push(server.version.trim());
      }

      const actionItem =
        sourceItem ??
        ({
          id: `installed:${normalizedFileName}`,
          title: displayName,
          description,
          author: 'Local',
          platform: 'Modrinth',
          source_obj: {},
        } satisfies ProjectItem);

      return {
        fileName,
        normalizedFileName,
        displayName,
        description,
        iconUrl: sourceItem?.icon_url,
        state: isDisabledPluginFile(fileName) ? 'disabled' : 'enabled',
        fileVersion: inferInstalledFileVersion(fileName) || t('plugins.browser.na'),
        minecraftVersions,
        sourceItem,
        actionItem,
      };
    });
  }, [
    compatibilityDetailByItemId,
    currentResultMatchesByInstalledFile,
    installedFiles,
    knownItemsByInstalledFile,
    server.version,
    t,
  ]);

  const resolveDependencyIdentity = async (projectId: string): Promise<DependencyIdentity> => {
    const cached = dependencyIdentityCacheRef.current[projectId];
    if (cached) {
      return cached;
    }

    let identity: ModrinthProjectIdentity | null = null;
    try {
      identity = await getModrinthProjectIdentity(projectId);
    } catch (error) {
      logError('Failed to resolve Modrinth dependency identity', error, { projectId });
    }

    const resolved: DependencyIdentity = {
      projectId,
      slug: identity?.slug || projectId,
      title: identity?.title || identity?.slug || projectId,
    };

    dependencyIdentityCacheRef.current[projectId] = resolved;
    return resolved;
  };

  function inferSpigotCompatibility(item: ProjectItem): CompatibilityStatus {
    const tag = typeof item.source_obj.tag === 'string' ? item.source_obj.tag : '';
    const hints = extractVersionHints(`${item.description} ${tag}`);
    if (hints.length === 0) {
      return 'unknown';
    }

    return isCompatibleVersion(hints, server.version) ? 'compatible' : 'incompatible';
  }

  async function search() {
    if (!isInAppSearch) {
      return;
    }

    setLoading(true);
    setResults([]);

    try {
      const offset = page * LIMIT;
      let items: ProjectItem[] = [];

      if (platform === 'Modrinth') {
        const searchType = isModServer ? 'mod' : 'plugin';
        const facets = `[["project_type:${searchType}"],["versions:${server.version}"]]`;
        const result = await searchModrinth(query, facets, offset, LIMIT);

        items = result.hits
          .map(mapModrinthProject)
          .filter((item): item is ProjectItem => item !== null);

        setHasNextPage(result.total_hits > offset + items.length);
        setTotalPages(Math.max(1, Math.ceil(result.total_hits / LIMIT)));
      } else if (platform === 'Hangar') {
        const data = await searchHangar(query, offset);

        items = data.result.map(mapHangarProject);

        setHasNextPage(items.length === LIMIT);
        setTotalPages(null);
      } else if (platform === 'Spigot') {
        const resources = await searchSpigot(query, page + 1, LIMIT);
        items = resources.map(mapSpigotResource);
        setHasNextPage(items.length === LIMIT);
        setTotalPages(null);
      }

      setResults(items);
    } catch (error) {
      logError('Plugin search failed', error, {
        platform,
        query,
        page,
      });
      setHasNextPage(false);
      setTotalPages(null);
      const message = toErrorMessage(error);
      if (platform === 'Hangar') {
        showToast(t('plugins.browser.fetchHangarError', { message }), 'error');
      } else if (platform === 'Spigot') {
        showToast(t('plugins.browser.fetchSpigotError', { message }), 'error');
      } else {
        showToast(t('plugins.browser.fetchError'), 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  const performInstall = async (
    item: ProjectItem,
    mode: 'fresh' | 'overwrite' | 'update',
    installedFile?: string,
  ) => {
    const pluginDir = `${server.path}/${folderName}`;
    const preserveDisabledState = Boolean(installedFile && isDisabledPluginFile(installedFile));
    let installedArtifactName: string | null = null;
    let existingDeleted = false;

    const replaceExistingFileIfNeeded = async (_downloadedTempFile: string): Promise<boolean> => {
      if (!installedFile || existingDeleted) {
        return true;
      }

      const requestedInstalledFile = toListedPluginFileName(installedFile);
      if (!requestedInstalledFile) {
        existingDeleted = true;
        return true;
      }

      const directTargetPath = `${pluginDir}/${requestedInstalledFile}`;
      try {
        await deleteItem(directTargetPath);
        existingDeleted = true;
        return true;
      } catch (error) {
        if (!isPathMissingError(error)) {
          console.error('Direct delete of installed file failed before fallback resolution', {
            requestedInstalledFile,
            pluginDir,
            error: toErrorMessage(error),
          });
        }
      }

      try {
        const entries = await listFiles(pluginDir);
        const files = collectPluginFileNames(entries);
        const resolvedInstalled = resolveInstalledFileMatch(files, installedFile);
        if (!resolvedInstalled) {
          existingDeleted = true;
          return true;
        }

        const targetPath = `${pluginDir}/${resolvedInstalled.fileName}`;
        await deleteItem(targetPath);
        existingDeleted = true;
        return true;
      } catch (error) {
        console.error('Failed to delete existing installed file after install', {
          requestedInstalledFile: installedFile,
          pluginDir,
          error: toErrorMessage(error),
        });
        showToast(t('plugins.browser.deleteExistingError'), 'error');
        return false;
      }
    };

    setInstallingId(item.id);
    try {
      if (item.platform === 'Modrinth') {
        const loader = server.software.toLowerCase();
        const resolvedVersion = await getCompatibleModrinthVersion({
          projectId: item.id,
          loader,
          minecraftVersion: server.version,
        });

        if (!resolvedVersion) {
          showToast(t('plugins.browser.noCompatibleVersion'), 'error');
          return;
        }

        const requiredDependencies = Array.from(
          new Map(
            resolvedVersion.dependencies
              .filter(
                (dependency) =>
                  dependency.dependencyType.toLowerCase() === 'required' &&
                  typeof dependency.projectId === 'string',
              )
              .map((dependency) => {
                const dependencyProjectId = dependency.projectId as string;
                return [
                  `${dependencyProjectId}:${dependency.versionId ?? ''}`,
                  dependency,
                ] as const;
              }),
          ).values(),
        );

        if (requiredDependencies.length > 0) {
          const requiredProjects = await Promise.all(
            requiredDependencies.map((dependency) =>
              resolveDependencyIdentity(dependency.projectId as string),
            ),
          );
          const projectIdentityById = Object.fromEntries(
            requiredProjects.map((dependency) => [dependency.projectId, dependency]),
          );

          const missingDependencies: RequiredDependencyPlan[] = requiredDependencies
            .map((dependency) => {
              const dependencyProjectId = dependency.projectId as string;
              const identity = projectIdentityById[dependencyProjectId] ?? {
                projectId: dependencyProjectId,
                slug: dependencyProjectId,
                title: dependencyProjectId,
              };
              return {
                projectId: dependencyProjectId,
                versionId: dependency.versionId,
                fileName: dependency.fileName,
                identity,
              };
            })
            .filter(
              (dependency) =>
                !isCandidateInstalled(dependency.identity.slug) &&
                !isCandidateInstalled(dependency.identity.title) &&
                !isCandidateInstalled(dependency.projectId),
            );

          if (missingDependencies.length > 0) {
            const previewTitles = missingDependencies
              .slice(0, 3)
              .map((dependency) => dependency.identity.title);
            const preview = previewTitles.join(', ');
            const suffix = missingDependencies.length > 3 ? ', ...' : '';
            const remainingCount = Math.max(missingDependencies.length - previewTitles.length, 0);
            const previewList = previewTitles.map((title) => `- ${title}`).join('\n');
            const remainingLine =
              remainingCount > 0 ? `\n- ... ${remainingCount} more dependencies` : '';
            const dependencyPrompt = tSafe(
              'plugins.browser.dependencyMissing',
              `${missingDependencies.length} missing dependencies found.\n\nDependencies:\n${previewList}${remainingLine}\n\nInstall them first?`,
              {
                count: missingDependencies.length,
                preview,
                suffix,
                previewList,
                remainingCount,
                remainingLine,
              },
            );

            const shouldInstallDependencies = await ask(dependencyPrompt, {
              title: tSafe('plugins.browser.dependencyCheck', 'Dependency Check'),
              kind: 'warning',
            });

            if (shouldInstallDependencies) {
              let installedDependencyCount = 0;
              for (const dependency of missingDependencies) {
                try {
                  let dependencyVersion = null;

                  if (dependency.versionId) {
                    dependencyVersion = await getModrinthVersionById(dependency.versionId);
                  }

                  if (!dependencyVersion) {
                    dependencyVersion = await getCompatibleModrinthVersion({
                      projectId: dependency.projectId,
                      loader,
                      minecraftVersion: server.version,
                    });
                  }

                  if (!dependencyVersion) {
                    showToast(
                      tSafe(
                        'plugins.browser.dependencyVersionNotFound',
                        `No compatible version found for dependency ${dependency.identity.title}`,
                        { title: dependency.identity.title },
                      ),
                      'info',
                    );
                    continue;
                  }

                  const dependencyFileName = dependency.fileName || dependencyVersion.fileName;
                  await installModrinthProject(
                    dependencyVersion.id,
                    dependencyFileName,
                    `${server.path}/${folderName}`,
                  );
                  installedDependencyCount += 1;
                } catch (error) {
                  logError('Failed to install dependency plugin', error, {
                    dependencyTitle: dependency.identity.title,
                    dependencyProjectId: dependency.identity.projectId,
                  });
                  showToast(
                    tSafe(
                      'plugins.browser.dependencyInstallFailed',
                      `Failed to install dependency ${dependency.identity.title}`,
                      { title: dependency.identity.title },
                    ),
                    'error',
                  );
                }
              }

              if (installedDependencyCount > 0) {
                showToast(
                  tSafe(
                    'plugins.browser.dependencyInstallSuccess',
                    `Installed ${installedDependencyCount} dependencies`,
                    {
                      count: installedDependencyCount,
                    },
                  ),
                  'success',
                );
                await refreshInstalled();
              }

              // Check if all required dependencies were installed
              if (installedDependencyCount < missingDependencies.length) {
                showToast(
                  tSafe(
                    'plugins.browser.dependencyInstallIncomplete',
                    'Not all required dependencies were installed. Main plugin installation aborted.',
                  ),
                  'error',
                );
                return;
              }
            } else {
              // User declined to install dependencies
              showToast(
                tSafe(
                  'plugins.browser.dependencyCheckOnly',
                  'Required dependencies not installed. Main plugin installation aborted.',
                ),
                'error',
              );
              return;
            }
          }
        }

        const tempFileName = `${resolvedVersion.fileName}.tmp-${Date.now()}`;
        installedArtifactName = resolvedVersion.fileName;
        await installModrinthProject(resolvedVersion.id, tempFileName, pluginDir);

        if (!(await replaceExistingFileIfNeeded(tempFileName))) {
          await deleteItem(`${pluginDir}/${tempFileName}`).catch((cleanupError) => {
            console.error('Failed to clean up temporary plugin file after replace cancellation', {
              pluginDir,
              tempFileName,
              error: toErrorMessage(cleanupError),
            });
          });
          return;
        }

        await moveItem(`${pluginDir}/${tempFileName}`, `${pluginDir}/${installedArtifactName}`);
      } else if (item.platform === 'Hangar') {
        const owner = item.author;
        const slug = item.slug || item.title;
        const resolved = await resolveHangarDownload({
          owner,
          slug,
          software: server.software || 'Paper',
          minecraftVersion: server.version || '',
        });

        if (!resolved) {
          showToast(t('plugins.browser.noCompatibleVersion'), 'error');
          return;
        }

        if (!resolved.compatible) {
          const listedVersions = resolved.supportedVersions.slice(0, 3).join(', ');
          const suffix = resolved.supportedVersions.length > 3 ? ', ...' : '';
          showToast(
            listedVersions
              ? t('plugins.browser.compatibilityUnknownWithVersions', {
                  version: server.version,
                  versions: `${listedVersions}${suffix}`,
                })
              : t('plugins.browser.compatibilityUnknown', { version: server.version }),
            'info',
          );
        }

        if (!resolved.downloadUrl) {
          const externalUrl = resolved.externalUrl || `https://hangar.papermc.io/${owner}/${slug}`;
          await openExternal(externalUrl);
          showToast(t('plugins.browser.browserDownloadRequired'), 'info');
          return;
        }

        const tempFileNameHangar = `${resolved.fileName}.tmp-${Date.now()}`;
        installedArtifactName = resolved.fileName;
        await installHangarProject(resolved.downloadUrl, tempFileNameHangar, pluginDir);

        if (!(await replaceExistingFileIfNeeded(tempFileNameHangar))) {
          await deleteItem(`${pluginDir}/${tempFileNameHangar}`).catch((cleanupError) => {
            console.error(
              'Failed to clean up temporary Hangar plugin file after replace cancellation',
              {
                pluginDir,
                tempFileName: tempFileNameHangar,
                error: toErrorMessage(cleanupError),
              },
            );
          });
          return;
        }

        await moveItem(
          `${pluginDir}/${tempFileNameHangar}`,
          `${pluginDir}/${installedArtifactName}`,
        );
      } else if (item.platform === 'Spigot') {
        const resourceId = Number(item.id);
        if (!Number.isFinite(resourceId)) {
          showToast(t('plugins.browser.spigotIdInvalid'), 'error');
          return;
        }

        const shouldOpenBrowser =
          item.source_obj.external === true || item.source_obj.premium === true;
        if (shouldOpenBrowser) {
          await openExternal(`https://www.spigotmc.org/resources/${resourceId}/`);
          showToast(t('plugins.browser.spigotBrowserRequired'), 'info');
          return;
        }

        const extension = normalizeFileExtension(
          typeof item.source_obj.fileType === 'string' ? item.source_obj.fileType : '.jar',
        );
        const versionId =
          typeof item.source_obj.latestVersionId === 'number'
            ? item.source_obj.latestVersionId
            : undefined;
        const fileName = `${toSlug(item.title)}-${resourceId}${extension}`;

        const tempFileNameSpigot = `${fileName}.tmp-${Date.now()}`;
        installedArtifactName = fileName;
        await installSpigotProject(resourceId, tempFileNameSpigot, pluginDir, versionId);

        if (!(await replaceExistingFileIfNeeded(tempFileNameSpigot))) {
          await deleteItem(`${pluginDir}/${tempFileNameSpigot}`).catch((cleanupError) => {
            console.error(
              'Failed to clean up temporary Spigot plugin file after replace cancellation',
              {
                pluginDir,
                tempFileName: tempFileNameSpigot,
                error: toErrorMessage(cleanupError),
              },
            );
          });
          return;
        }

        await moveItem(
          `${pluginDir}/${tempFileNameSpigot}`,
          `${pluginDir}/${installedArtifactName}`,
        );
      }

      if (preserveDisabledState && installedArtifactName) {
        const installedPath = `${pluginDir}/${installedArtifactName}`;
        await moveItem(installedPath, `${installedPath}.disabled`);
      }

      const successLabel =
        mode === 'fresh'
          ? t('plugins.browser.installSuccess', { title: item.title })
          : mode === 'overwrite'
            ? t('plugins.browser.overwriteSuccess', { title: item.title })
            : t('plugins.browser.updateSuccess', { title: item.title });
      showToast(successLabel, 'success');
    } catch (error) {
      logError('Plugin installation flow failed', error, {
        itemId: item.id,
        itemTitle: item.title,
        mode,
      });
      showToast(t('plugins.browser.installError'), 'error');
    } finally {
      await refreshInstalled();
      setInstallingId(null);
    }
  };

  const handleInstall = (item: ProjectItem) => {
    const compatibility = compatibilityByItemId[item.id] ?? 'unknown';
    if (compatibility === 'incompatible') {
      showToast(t('plugins.browser.incompatibilityWarning'), 'info');
    }

    const installedMatch = findInstalledMatchStrict(item);
    if (installedMatch) {
      const updateStatus = updateStatusByItemId[item.id] ?? 'unknown';
      if (updateStatus === 'update-available') {
        void performInstall(item, 'update', installedMatch);
        return;
      }
      setDupDialog({ item, installedFile: installedMatch });
      return;
    }

    void performInstall(item, 'fresh');
  };

  const openExternal = async (url: string) => {
    try {
      await openUrl(url);
    } catch (error) {
      logError('Failed to open external plugin URL', error, { url });
      showToast(t('plugins.browser.browserOpenError'), 'error');
    }
  };

  const handleToggleInstalled = async (item: ProjectItem, installedFile: string) => {
    const pluginDir = `${server.path}/${folderName}`;
    let stage:
      | 'direct-rename'
      | 'direct-conflict'
      | 'direct-overwrite-target'
      | 'direct-retry-rename'
      | 'list-files'
      | 'resolve-source'
      | 'resolve-target'
      | 'overwrite-target'
      | 'rename'
      | 'retry-rename' = 'list-files';
    let availableFiles: string[] = [];
    let sourceResolution:
      | 'exact'
      | 'case-insensitive'
      | 'counterpart-exact'
      | 'counterpart-case-insensitive'
      | 'normalized-unique'
      | null = null;
    let resolvedInstalledFile: string | null = null;
    let nextFile: string | null = null;
    let overwrittenTargetFile: string | null = null;
    const notifyToggleSuccess = (sourceFileName: string) => {
      showToast(
        isDisabledPluginFile(sourceFileName)
          ? t('plugins.browser.pluginEnabled', { title: item.title })
          : t('plugins.browser.pluginDisabled', { title: item.title }),
        'success',
      );
    };

    setInstallingId(item.id);
    try {
      const requestedInstalledFile = toListedPluginFileName(installedFile);
      if (!requestedInstalledFile) {
        throw new Error(`Installed file is empty for toggle: ${installedFile}`);
      }

      resolvedInstalledFile = requestedInstalledFile;
      sourceResolution = 'exact';
      nextFile = togglePluginFileName(requestedInstalledFile);
      const directSourcePath = `${pluginDir}/${requestedInstalledFile}`;
      const directTargetPath = `${pluginDir}/${nextFile}`;

      stage = 'direct-rename';
      try {
        await moveItem(directSourcePath, directTargetPath);
        notifyToggleSuccess(requestedInstalledFile);
        return;
      } catch (directError) {
        if (isAlreadyExistsError(directError)) {
          stage = 'direct-conflict';
          throw new Error(
            `Cannot toggle plugin: target file already exists: ${nextFile}. Please manually resolve the conflict.`,
          );
        }

        if (!isPathMissingError(directError)) {
          throw directError;
        }
      }

      const entries = await listFiles(pluginDir);
      const files = collectPluginFileNames(entries);
      availableFiles = files;

      stage = 'resolve-source';

      const resolvedMatch = resolveInstalledFileMatch(files, installedFile);
      if (!resolvedMatch) {
        throw new Error(`Installed file not found for toggle: ${installedFile}`);
      }
      resolvedInstalledFile = resolvedMatch.fileName;
      sourceResolution = resolvedMatch.resolution;

      nextFile = togglePluginFileName(resolvedInstalledFile);
      const sourcePath = `${pluginDir}/${resolvedInstalledFile}`;
      const targetPath = `${pluginDir}/${nextFile}`;

      stage = 'resolve-target';

      const targetMatches = files.filter(
        (candidate) =>
          candidate !== resolvedInstalledFile && candidate.toLowerCase() === nextFile.toLowerCase(),
      );
      if (targetMatches.length > 1) {
        throw new Error(
          `Ambiguous target matches while preparing overwrite policy: ${targetMatches.join(', ')}`,
        );
      }

      const existingTargetFile = targetMatches[0] ?? null;
      if (existingTargetFile) {
        stage = 'overwrite-target';
        await deleteItem(`${pluginDir}/${existingTargetFile}`);
        overwrittenTargetFile = existingTargetFile;
      }

      stage = 'rename';
      try {
        await moveItem(sourcePath, targetPath);
      } catch (error) {
        if (!isAlreadyExistsError(error)) {
          throw error;
        }

        stage = 'retry-rename';
        try {
          await deleteItem(targetPath);
          overwrittenTargetFile = overwrittenTargetFile ?? nextFile;
        } catch (deleteError) {
          if (!isPathMissingError(deleteError)) {
            throw deleteError;
          }
        }
        await moveItem(sourcePath, targetPath);
      }

      notifyToggleSuccess(resolvedInstalledFile);
    } catch (error) {
      console.error('Failed to toggle plugin state', {
        stage,
        itemId: item.id,
        itemTitle: item.title,
        requestedInstalledFile: installedFile,
        resolvedInstalledFile,
        sourceResolution,
        nextFile,
        overwrittenTargetFile,
        folderName,
        pluginDir,
        availableFiles,
        error: toErrorMessage(error),
      });
      showToast(t('plugins.browser.toggleError'), 'error');
    } finally {
      await refreshInstalled();
      setInstallingId(null);
    }
  };

  const handleUninstallInstalled = async (entry: InstalledPluginEntry) => {
    const pluginDir = `${server.path}/${folderName}`;
    setBusyInstalledFile(entry.normalizedFileName);
    try {
      const confirmed = await ask(
        t('plugins.browser.confirmUninstall', {
          name: entry.displayName || entry.fileName,
        }),
        {
          title: t('plugins.browser.uninstallTitle'),
          kind: 'warning',
        },
      );

      if (!confirmed) {
        setBusyInstalledFile(null);
        return;
      }

      const requestedInstalledFile = toListedPluginFileName(entry.fileName);
      if (!requestedInstalledFile) {
        throw new Error(`Installed file is empty for uninstall: ${entry.fileName}`);
      }

      const directTargetPath = `${pluginDir}/${requestedInstalledFile}`;
      try {
        await deleteItem(directTargetPath);
        showToast(t('plugins.browser.uninstallSuccess', { title: entry.displayName }), 'success');
        return;
      } catch (error) {
        if (!isPathMissingError(error)) {
          throw error;
        }
      }

      const entries = await listFiles(pluginDir);
      const files = collectPluginFileNames(entries);
      const resolved = resolveInstalledFileMatch(files, entry.fileName);
      if (!resolved) {
        throw new Error(`Installed file not found for uninstall: ${entry.fileName}`);
      }

      const targetPath = `${pluginDir}/${resolved.fileName}`;
      await deleteItem(targetPath);
      showToast(t('plugins.browser.uninstallSuccess', { title: entry.displayName }), 'success');
    } catch (error) {
      console.error('Failed to uninstall installed plugin', {
        requestedInstalledFile: entry.fileName,
        normalizedInstalledFile: entry.normalizedFileName,
        pluginDir,
        error: toErrorMessage(error),
      });
      showToast(t('plugins.browser.uninstallError'), 'error');
    } finally {
      await refreshInstalled();
      setBusyInstalledFile(null);
    }
  };

  const handleReinstallInstalled = (entry: InstalledPluginEntry) => {
    if (!entry.sourceItem) {
      showToast(t('plugins.browser.reinstallUnavailable'), 'info');
      return;
    }
    void performInstall(entry.sourceItem, 'overwrite', entry.fileName);
  };

  const compatibilityLabel = (status: CompatibilityStatus): string => {
    switch (status) {
      case 'compatible':
        return t('plugins.browser.compatCompatible');
      case 'incompatible':
        return t('plugins.browser.compatIncompatible');
      case 'checking':
        return t('plugins.browser.compatChecking');
      default:
        return t('plugins.browser.compatUnknown');
    }
  };

  const updateStatusLabel = (status: UpdateStatus): string => {
    switch (status) {
      case 'checking':
        return t('plugins.browser.updateChecking');
      case 'update-available':
        return t('plugins.browser.updateAvailable');
      case 'up-to-date':
        return t('plugins.browser.upToDate');
      default:
        return t('plugins.browser.updateUnknown');
    }
  };

  const actionLabel = (
    item: ProjectItem,
    installedState: 'none' | 'enabled' | 'disabled',
    updateStatus: UpdateStatus | null,
  ) => {
    if (installingId === item.id) {
      return t('plugins.browser.installing');
    }
    const requiresBrowser =
      item.platform === 'Spigot' &&
      (item.source_obj.external === true || item.source_obj.premium === true);
    if (!requiresBrowser && installedState !== 'none' && updateStatus === 'update-available') {
      return t('plugins.browser.update');
    }
    return requiresBrowser ? t('plugins.browser.open') : t('plugins.install.button');
  };

  const getCompatibilityPriority = (itemId: string): number => {
    const status = compatibilityByItemId[itemId] ?? 'unknown';
    if (status === 'compatible') {
      return 4;
    }
    if (status === 'unknown') {
      return 3;
    }
    if (status === 'checking') {
      return 2;
    }
    return 1;
  };

  const sortedResults = useMemo(() => {
    if (sortMode === 'relevance') {
      return results;
    }

    const next = [...results];
    if (sortMode === 'downloads') {
      next.sort((left, right) => (right.downloads ?? 0) - (left.downloads ?? 0));
      return next;
    }

    if (sortMode === 'name') {
      next.sort((left, right) => left.title.localeCompare(right.title));
      return next;
    }

    next.sort((left, right) => {
      const byCompatibility =
        getCompatibilityPriority(right.id) - getCompatibilityPriority(left.id);
      if (byCompatibility !== 0) {
        return byCompatibility;
      }
      return (right.downloads ?? 0) - (left.downloads ?? 0);
    });
    return next;
  }, [results, sortMode, compatibilityByItemId]);

  const updateAvailableCount = useMemo(() => {
    return sortedResults.reduce((count, item) => {
      return updateStatusByItemId[item.id] === 'update-available' ? count + 1 : count;
    }, 0);
  }, [sortedResults, updateStatusByItemId]);

  const supportedVersionsLabel = (itemId: string) => {
    const versions = compatibilityDetailByItemId[itemId]?.supportedVersions ?? [];
    if (versions.length === 0) {
      return t('plugins.browser.versionsNotPublished');
    }
    const preview = versions.slice(0, 6).join(', ');
    return versions.length > 6 ? `${preview}, ...` : preview;
  };

  const loaderLabel = (item: ProjectItem) => {
    if (item.platform === 'Spigot') {
      return t('plugins.browser.loaderSpigotPaper');
    }

    if (item.platform === 'Hangar') {
      return server.software || 'Paper';
    }

    const source = item.source_obj;
    const loaders = [
      ...extractLoaderHintsFromUnknown(source.display_categories),
      ...extractLoaderHintsFromUnknown(source.categories),
      ...extractLoaderHintsFromUnknown(source.loaders),
    ];

    if (loaders.length > 0) {
      return loaders.slice(0, 4).join(', ');
    }

    return isModServer
      ? server.software || t('plugins.browser.loaderMod')
      : t('plugins.browser.loaderDefault');
  };

  const resolveReadme = async (item: ProjectItem): Promise<string | null> => {
    if (item.platform === 'Modrinth') {
      return getModrinthProjectBody(item.id);
    }

    if (item.platform === 'Hangar') {
      const owner = item.author.trim();
      const slug = (item.slug || '').trim() || toSlug(item.title);
      if (!owner || !slug) {
        return null;
      }
      return getHangarProjectBody(owner, slug);
    }

    const resourceId = Number(item.id);
    if (!Number.isFinite(resourceId)) {
      return null;
    }
    return getSpigotResourceBody(resourceId);
  };

  const closeDetailModal = () => {
    detailRequestIdRef.current += 1;
    setDetailItem(null);
    setDetailTab('info');
    setDetailError(null);
  };

  const openDetailModal = (item: ProjectItem) => {
    setDetailItem(item);
    setDetailTab('info');
    setDetailError(null);

    const cacheKey = `${item.platform}:${item.id}`;
    if (Object.hasOwn(detailReadmeCacheRef.current, cacheKey)) {
      setDetailLoading(false);
      setDetailReadme(detailReadmeCacheRef.current[cacheKey]);
      return;
    }

    setDetailLoading(true);
    setDetailReadme(null);

    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;

    void (async () => {
      try {
        const raw = await resolveReadme(item);
        const normalized = raw ? normalizeReadme(item.platform, raw) : null;
        detailReadmeCacheRef.current[cacheKey] = normalized;

        if (detailRequestIdRef.current !== requestId) {
          return;
        }

        setDetailReadme(normalized);
      } catch (error) {
        logError('Failed to load plugin README', error, {
          itemId: item.id,
          cacheKey,
        });
        if (detailRequestIdRef.current !== requestId) {
          return;
        }
        setDetailError(t('plugins.browser.readmeFetchError'));
      } finally {
        if (detailRequestIdRef.current === requestId) {
          setDetailLoading(false);
        }
      }
    })();
  };

  useEffect(() => {
    if (!detailItem) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDetailModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [detailItem]);

  const jumpToPage = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      showToast(t('plugins.browser.pageInputError'), 'info');
      return;
    }

    const targetZeroBased = parsed - 1;
    const clamped = totalPages ? Math.min(totalPages - 1, targetZeroBased) : targetZeroBased;
    setPage(clamped);
  };

  const detailCompatibility = detailItem
    ? (compatibilityByItemId[detailItem.id] ?? 'unknown')
    : 'unknown';
  const detailProjectUrl = detailItem ? projectPageUrl(detailItem) : '';
  const platformSwitchInitial = prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 };
  const platformSwitchAnimate = { opacity: 1, y: 0 };
  const platformSwitchExit = prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 };
  const platformSwitchTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: 'easeOut' as const };

  return (
    <div className="plugin-browser">
      <div
        className="plugin-browser__section-switch"
        role="tablist"
        aria-label={t('plugins.browser.viewSwitch')}
      >
        <button
          type="button"
          className={`plugin-browser__section-tab ${activeSection === 'browse' ? 'is-active' : ''}`}
          onClick={() => setActiveSection('browse')}
          role="tab"
          aria-selected={activeSection === 'browse'}
        >
          {t('plugins.browser.tabBrowse')}
        </button>
        <button
          type="button"
          className={`plugin-browser__section-tab ${activeSection === 'installed' ? 'is-active' : ''}`}
          onClick={() => setActiveSection('installed')}
          role="tab"
          aria-selected={activeSection === 'installed'}
        >
          {t('plugins.browser.tabInstalled', { count: installedFiles.length })}
        </button>
      </div>

      {activeSection === 'browse' ? (
        <>
          <div className="plugin-browser__platform-grid">
            {platformOptions.map((option) => {
              const Icon = option.icon;
              const active = option.key === platform;
              const showLogo = option.logoUrl.length > 0 && !logoLoadFailed[option.key];

              return (
                <motion.button
                  key={option.key}
                  type="button"
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                  whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                  className={`plugin-browser__platform-chip ${active ? 'is-active' : ''}`}
                  onClick={() => {
                    setPlatform(option.key);
                    setPage(0);
                  }}
                >
                  <div className="plugin-browser__platform-logo-wrap">
                    {showLogo ? (
                      <img
                        src={option.logoUrl}
                        alt={`${option.label} logo`}
                        className="plugin-browser__platform-logo"
                        loading="lazy"
                        onError={() =>
                          setLogoLoadFailed((prev) => ({
                            ...prev,
                            [option.key]: true,
                          }))
                        }
                      />
                    ) : (
                      <Icon size={14} className="plugin-browser__platform-fallback-icon" />
                    )}
                  </div>
                  <div className="plugin-browser__platform-copy">
                    <span className="plugin-browser__platform-label">{option.label}</span>
                    <span className="plugin-browser__platform-hint">{option.hint}</span>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {isInAppSearch ? (
            <>
              <div className="plugin-browser__search-row">
                <div className="plugin-browser__search-input-wrap">
                  <Search size={16} />
                  <input
                    type="text"
                    className="plugin-browser__search-input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('plugins.browser.searchOn', {
                      platform: searchPlatformLabel,
                    })}
                    onKeyDown={(event) => event.key === 'Enter' && void search()}
                  />
                </div>

                <button
                  type="button"
                  className="plugin-browser__search-btn"
                  onClick={() => void search()}
                  disabled={loading}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  <span>{loading ? t('plugins.browser.searching') : t('common.search')}</span>
                </button>
              </div>

              <div className="plugin-browser__sort-row">
                <span className="plugin-browser__sort-label">{t('plugins.browser.sortLabel')}</span>
                <select
                  className="input-field plugin-browser__sort-select"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  <option value="relevance">{t('plugins.browser.sortRelevance')}</option>
                  <option value="downloads">{t('plugins.browser.sortDownloads')}</option>
                  <option value="name">{t('plugins.browser.sortName')}</option>
                  <option value="compatibility">{t('plugins.browser.sortCompatibility')}</option>
                </select>
              </div>
            </>
          ) : (
            <div className="plugin-browser__unsupported-panel">
              <p>{t('plugins.browser.unsupportedPlatform')}</p>
              <button
                type="button"
                className="plugin-browser__unsupported-btn"
                onClick={() => openExternal('https://www.curseforge.com/minecraft/mc-mods')}
              >
                <ExternalLink size={16} />
                <span>
                  {t('plugins.browser.openInBrowser', {
                    platform: selectedPlatform?.label || platform,
                  })}
                </span>
              </button>
              <p className="plugin-browser__unsupported-note">
                {t('plugins.browser.downloadInstructions', { folder: folderName })}
              </p>
            </div>
          )}

          {isInAppSearch && platform === 'Spigot' && (
            <div className="plugin-browser__platform-note">{t('plugins.browser.spigotNote')}</div>
          )}

          {isInAppSearch && platform === 'Hangar' && (
            <div className="plugin-browser__platform-note">{t('plugins.browser.hangarNote')}</div>
          )}

          {isInAppSearch && updateAvailableCount > 0 && (
            <div className="plugin-browser__update-summary">
              <span>{t('plugins.browser.updateSummary', { count: updateAvailableCount })}</span>
              <span className="plugin-browser__update-summary-note">
                {t('plugins.browser.updateSummaryNote')}
              </span>
            </div>
          )}

          {isInAppSearch && (
            <>
              <div className="plugin-browser__results-grid">
                <AnimatePresence initial={false} mode="wait">
                  {sortedResults.map((item) => {
                    const installedMatch = findInstalledMatchStrict(item);
                    const installedState = installedMatch
                      ? isDisabledPluginFile(installedMatch)
                        ? 'disabled'
                        : 'enabled'
                      : 'none';
                    const compatibility = compatibilityByItemId[item.id] ?? 'unknown';
                    const updateStatus = installedMatch
                      ? (updateStatusByItemId[item.id] ?? 'unknown')
                      : null;
                    const hasUpdateAction =
                      installedState !== 'none' && updateStatus === 'update-available';
                    const showInstallAction = installedState === 'none' || hasUpdateAction;
                    const requiresBrowser =
                      item.platform === 'Spigot' &&
                      (item.source_obj.external === true || item.source_obj.premium === true);
                    const installActionButton = showInstallAction ? (
                      <button
                        type="button"
                        onClick={() => void handleInstall(item)}
                        disabled={installingId === item.id}
                        className={`plugin-browser__install-btn ${
                          requiresBrowser ? 'plugin-browser__install-btn--external' : ''
                        }`}
                      >
                        {installingId === item.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : requiresBrowser ? (
                          <ExternalLink size={14} />
                        ) : (
                          <Download size={14} />
                        )}
                        <span>{actionLabel(item, installedState, updateStatus)}</span>
                      </button>
                    ) : null;
                    const detailsButton = (
                      <button
                        type="button"
                        className="plugin-browser__details-btn"
                        onClick={() => openDetailModal(item)}
                      >
                        {t('plugins.browser.details')}
                      </button>
                    );

                    return (
                      <motion.div
                        key={`${item.platform}-${item.id}`}
                        initial={platformSwitchInitial}
                        animate={platformSwitchAnimate}
                        exit={platformSwitchExit}
                        transition={platformSwitchTransition}
                        className={`plugin-browser__result-card ${
                          hasUpdateAction ? 'is-update-available' : ''
                        }`}
                      >
                        <div
                          className="plugin-browser__result-icon"
                          style={{
                            backgroundImage: item.icon_url ? `url(${item.icon_url})` : 'none',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }}
                        />

                        <div className="plugin-browser__result-body">
                          <div
                            className={`plugin-browser__result-top ${
                              hasUpdateAction ? 'is-update-available' : ''
                            }`}
                          >
                            <div className="plugin-browser__result-title-wrap">
                              <div className="plugin-browser__result-title">{item.title}</div>
                              <div className="plugin-browser__result-source">{item.platform}</div>
                              <div className="plugin-browser__result-flags">
                                {installedMatch ? (
                                  <span
                                    className={`plugin-browser__installed-badge ${
                                      installedState === 'disabled' ? 'is-disabled' : ''
                                    }`}
                                  >
                                    {installedState === 'disabled'
                                      ? t('plugins.browser.disabledBadge')
                                      : t('plugins.browser.installedBadge')}
                                  </span>
                                ) : null}
                                <span
                                  className={`plugin-browser__compat-badge is-${compatibility}`}
                                >
                                  {compatibilityLabel(compatibility)}
                                </span>
                              </div>
                            </div>

                            <div
                              className={`plugin-browser__result-actions ${
                                hasUpdateAction ? 'is-update-available' : ''
                              }`}
                            >
                              {installActionButton}
                              {detailsButton}
                            </div>
                          </div>

                          <div className="plugin-browser__result-description">
                            {item.description || t('plugins.browser.noDescription')}
                          </div>

                          <div className="plugin-browser__result-meta">
                            <span className="plugin-browser__meta-item">
                              <Server size={13} />
                              <span>{item.author}</span>
                            </span>
                            <span className="plugin-browser__meta-item">
                              <Download size={13} />
                              <span>{item.downloads ? item.downloads.toLocaleString() : '-'}</span>
                            </span>
                            {item.stars ? (
                              <span className="plugin-browser__meta-item">
                                <Star size={13} />
                                <span>{item.stars}</span>
                              </span>
                            ) : null}
                          </div>

                          {requiresBrowser && (
                            <div className="plugin-browser__result-tag">
                              {t('plugins.browser.externalDownload')}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {sortedResults.length === 0 && !loading && (
                    <motion.div
                      key="empty"
                      initial={platformSwitchInitial}
                      animate={platformSwitchAnimate}
                      exit={platformSwitchExit}
                      transition={platformSwitchTransition}
                      className="plugin-browser__result-empty"
                    >
                      {t('plugins.browser.noResults')}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="plugin-browser__pager">
                <button
                  type="button"
                  className="plugin-browser__pager-btn"
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                  disabled={page === 0 || loading}
                >
                  <ArrowLeft size={14} />
                  <span>{t('plugins.browser.prev')}</span>
                </button>

                <span className="plugin-browser__pager-label">
                  {totalPages
                    ? t('plugins.browser.pageLabelWithTotal', {
                        current: page + 1,
                        total: totalPages,
                      })
                    : t('plugins.browser.pageLabel', { current: page + 1 })}
                </span>

                <div className="plugin-browser__pager-jump">
                  <input
                    type="number"
                    min={1}
                    max={totalPages ?? undefined}
                    value={pageInput}
                    onChange={(event) => setPageInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        jumpToPage();
                      }
                    }}
                    className="plugin-browser__pager-input"
                    aria-label={t('plugins.browser.pageNumberAriaLabel')}
                  />
                  <button
                    type="button"
                    className="plugin-browser__pager-go"
                    onClick={jumpToPage}
                    disabled={loading}
                  >
                    {t('plugins.browser.go')}
                  </button>
                </div>

                <button
                  type="button"
                  className="plugin-browser__pager-btn"
                  onClick={() => setPage((value) => value + 1)}
                  disabled={!hasNextPage || loading}
                >
                  <span>{t('plugins.browser.next')}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="plugin-browser__installed-panel">
          <div className="plugin-browser__installed-header">
            <h2 className="plugin-browser__installed-title">{t('plugins.installed.title')}</h2>
            <span className="plugin-browser__installed-count">
              {t('plugins.browser.tabInstalled', { count: installedEntries.length })}
            </span>
          </div>

          {installedEntries.length === 0 ? (
            <div className="plugin-browser__result-empty">{t('plugins.installed.empty')}</div>
          ) : (
            <div className="plugin-browser__installed-grid">
              {installedEntries.map((entry) => {
                const isProcessing =
                  busyInstalledFile === entry.normalizedFileName ||
                  installingId === entry.actionItem.id;
                const canReinstall = Boolean(entry.sourceItem);
                const installedUpdateStatus = entry.sourceItem
                  ? (updateStatusByItemId[entry.sourceItem.id] ?? null)
                  : null;
                const installedStatusBadge =
                  installedUpdateStatus === 'update-available' ||
                  installedUpdateStatus === 'up-to-date'
                    ? installedUpdateStatus
                    : null;
                const installedLatestFileName = entry.sourceItem
                  ? (latestFileByItemId[entry.sourceItem.id] ?? null)
                  : null;

                return (
                  <div key={entry.fileName} className="plugin-browser__installed-card">
                    <div className="plugin-browser__result-body plugin-browser__installed-body">
                      <div className="plugin-browser__installed-head">
                        <div
                          className="plugin-browser__result-icon plugin-browser__installed-icon"
                          style={{
                            backgroundImage: entry.iconUrl ? `url(${entry.iconUrl})` : 'none',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }}
                        >
                          {!entry.iconUrl ? (
                            <Package
                              size={20}
                              className="plugin-browser__installed-fallback-icon"
                            />
                          ) : null}
                        </div>
                        <div className="plugin-browser__result-title-wrap">
                          <div className="plugin-browser__result-title">{entry.displayName}</div>
                          <div className="plugin-browser__result-source">
                            {entry.sourceItem?.platform ?? t('plugins.browser.localSource')}
                          </div>
                          <div className="plugin-browser__result-flags plugin-browser__installed-flags">
                            <span
                              className={`plugin-browser__installed-badge ${
                                entry.state === 'disabled' ? 'is-disabled' : ''
                              }`}
                            >
                              {entry.state === 'disabled'
                                ? t('plugins.browser.disabledBadge')
                                : t('plugins.browser.installedBadge')}
                            </span>
                            {installedStatusBadge ? (
                              <span
                                className={`plugin-browser__update-badge is-${installedStatusBadge}`}
                                title={
                                  installedStatusBadge === 'update-available' &&
                                  installedLatestFileName
                                    ? t('plugins.browser.latestTooltip', {
                                        fileName: installedLatestFileName,
                                      })
                                    : undefined
                                }
                              >
                                {updateStatusLabel(installedStatusBadge)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="plugin-browser__result-description">{entry.description}</div>

                      <div className="plugin-browser__installed-meta">
                        <div className="plugin-browser__installed-meta-row">
                          <span className="plugin-browser__installed-meta-key">
                            {t('plugins.browser.installedFile')}
                          </span>
                          <span className="plugin-browser__installed-meta-value">
                            {entry.fileName}
                          </span>
                        </div>
                        <div className="plugin-browser__installed-meta-row">
                          <span className="plugin-browser__installed-meta-key">
                            {t('plugins.browser.installedVersion')}
                          </span>
                          <span className="plugin-browser__installed-meta-value">
                            {entry.fileVersion || t('plugins.browser.na')}
                          </span>
                        </div>
                        <div className="plugin-browser__installed-meta-row">
                          <span className="plugin-browser__installed-meta-key">
                            {t('plugins.browser.installedGameVersions')}
                          </span>
                          <span className="plugin-browser__installed-meta-value">
                            {entry.minecraftVersions.length > 0
                              ? entry.minecraftVersions.join(', ')
                              : t('plugins.browser.na')}
                          </span>
                        </div>
                      </div>

                      <div className="plugin-browser__installed-actions">
                        <button
                          type="button"
                          className="plugin-browser__installed-action plugin-browser__installed-action--danger"
                          onClick={() => void handleUninstallInstalled(entry)}
                          disabled={isProcessing}
                        >
                          {t('plugins.browser.uninstall')}
                        </button>
                        <button
                          type="button"
                          className="plugin-browser__installed-action plugin-browser__installed-action--primary"
                          onClick={() => handleReinstallInstalled(entry)}
                          disabled={isProcessing || !canReinstall}
                        >
                          {installingId === entry.actionItem.id
                            ? t('plugins.browser.installing')
                            : t('plugins.browser.reinstall')}
                        </button>
                        <button
                          type="button"
                          className={`plugin-browser__installed-action plugin-browser__installed-action--toggle ${
                            entry.state === 'disabled' ? 'is-enable' : 'is-disable'
                          }`}
                          onClick={() =>
                            void handleToggleInstalled(entry.actionItem, entry.fileName)
                          }
                          disabled={isProcessing}
                        >
                          {entry.state === 'disabled'
                            ? t('plugins.browser.enable')
                            : t('plugins.browser.disable')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {detailItem && (
        <div
          className="plugin-browser__detail-modal-overlay modal-backdrop"
          onClick={closeDetailModal}
        >
          <div
            className="plugin-browser__detail-modal modal-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="plugin-browser__detail-header">
              <div className="plugin-browser__detail-title-wrap">
                <h3 className="plugin-browser__detail-title">{detailItem.title}</h3>
                <div className="plugin-browser__detail-subtitle">
                  <span>{detailItem.platform}</span>
                  <span>
                    {t('plugins.browser.byAuthor')} {detailItem.author}
                  </span>
                  <span className={`plugin-browser__compat-badge is-${detailCompatibility}`}>
                    {compatibilityLabel(detailCompatibility)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="plugin-browser__detail-close"
                onClick={closeDetailModal}
                aria-label={t('plugins.browser.closeDetailsAriaLabel')}
              >
                <X size={16} />
              </button>
            </div>

            <div className="plugin-browser__detail-tabs">
              <button
                type="button"
                className={`plugin-browser__detail-tab ${detailTab === 'info' ? 'is-active' : ''}`}
                onClick={() => setDetailTab('info')}
              >
                {t('plugins.browser.detailInfo')}
              </button>
              <button
                type="button"
                className={`plugin-browser__detail-tab ${detailTab === 'readme' ? 'is-active' : ''}`}
                onClick={() => setDetailTab('readme')}
              >
                {t('plugins.browser.detailReadme')}
              </button>
            </div>

            {detailTab === 'info' ? (
              <div className="plugin-browser__detail-info-panel">
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">
                    {t('plugins.browser.detailProject')}
                  </span>
                  <span className="plugin-browser__detail-value">{detailItem.id}</span>
                </div>
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">
                    {t('plugins.browser.detailSlug')}
                  </span>
                  <span className="plugin-browser__detail-value">
                    {detailItem.slug || t('plugins.browser.na')}
                  </span>
                </div>
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">
                    {t('plugins.browser.detailSupportedMC')}
                  </span>
                  <span className="plugin-browser__detail-value">
                    {supportedVersionsLabel(detailItem.id)}
                  </span>
                </div>
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">
                    {t('plugins.browser.detailLoader')}
                  </span>
                  <span className="plugin-browser__detail-value">{loaderLabel(detailItem)}</span>
                </div>
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">
                    {t('plugins.browser.detailDownloads')}
                  </span>
                  <span className="plugin-browser__detail-value">
                    {detailItem.downloads ? detailItem.downloads.toLocaleString() : '-'}
                  </span>
                </div>
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">
                    {t('plugins.browser.detailSummary')}
                  </span>
                  <span className="plugin-browser__detail-value">
                    {detailItem.description || t('plugins.browser.noDescription')}
                  </span>
                </div>
                <div className="plugin-browser__detail-actions">
                  <button
                    type="button"
                    className="plugin-browser__detail-link-btn"
                    onClick={() => void openExternal(detailProjectUrl)}
                  >
                    <ExternalLink size={14} />
                    <span>{t('plugins.browser.detailProjectPage')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="plugin-browser__detail-readme-panel">
                {detailLoading ? (
                  <div className="plugin-browser__detail-readme-empty">
                    <Loader2 size={15} className="animate-spin" />
                    <span>{t('plugins.browser.readmeLoading')}</span>
                  </div>
                ) : detailError ? (
                  <div className="plugin-browser__detail-readme-empty is-error">{detailError}</div>
                ) : detailReadme ? (
                  <div className="plugin-browser__detail-readme-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw, rehypeSanitize]}
                    >
                      {detailReadme}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="plugin-browser__detail-readme-empty">
                    {t('plugins.browser.noReadme')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {dupDialog && (
        <div className="plugin-browser__dup-overlay modal-backdrop">
          <div className="plugin-browser__dup-panel modal-panel">
            <h3 className="plugin-browser__dup-title">{t('plugins.browser.dupTitle')}</h3>
            <p className="plugin-browser__dup-description">
              {t('plugins.browser.dupDescription', {
                title: dupDialog.item.title,
                folder: folderName,
              })}
            </p>

            <div className="plugin-browser__dup-file">
              {t('plugins.browser.dupExistingFile', { file: dupDialog.installedFile })}
            </div>

            <div className="plugin-browser__dup-notes">
              <div>{t('plugins.browser.dupOverwriteNote')}</div>
              <div>{t('plugins.browser.dupUpdateNote')}</div>
            </div>

            <div className="plugin-browser__dup-actions">
              <button
                type="button"
                className="plugin-browser__dup-btn plugin-browser__dup-btn--cancel"
                onClick={() => setDupDialog(null)}
              >
                {t('plugins.browser.dupCancel')}
              </button>

              <button
                type="button"
                className="plugin-browser__dup-btn plugin-browser__dup-btn--overwrite"
                onClick={() => {
                  const target = dupDialog;
                  setDupDialog(null);
                  if (target) {
                    void performInstall(target.item, 'overwrite', target.installedFile);
                  }
                }}
              >
                {t('plugins.browser.dupOverwrite')}
              </button>

              <button
                type="button"
                className="plugin-browser__dup-btn plugin-browser__dup-btn--update"
                onClick={() => {
                  const target = dupDialog;
                  setDupDialog(null);
                  if (target) {
                    void performInstall(target.item, 'update', target.installedFile);
                  }
                }}
              >
                {t('plugins.browser.dupUpdate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
