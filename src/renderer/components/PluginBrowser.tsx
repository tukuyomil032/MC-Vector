import { ask } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { AnimatePresence, motion } from 'framer-motion';
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
import remarkGfm from 'remark-gfm';
import { deleteItem, listFiles, moveItem } from '../../lib/file-commands';
import {
  checkHangarCompatibility,
  getCompatibleModrinthVersion,
  getHangarProjectBody,
  getModrinthProjectBody,
  getModrinthProjectIdentity,
  getSpigotResourceBody,
  installHangarProject,
  installModrinthProject,
  installSpigotProject,
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

type CompatibilityStatus = 'checking' | 'compatible' | 'incompatible' | 'unknown';
type UpdateStatus = 'checking' | 'update-available' | 'up-to-date' | 'unknown';
type SortMode = 'relevance' | 'downloads' | 'name' | 'compatibility';

type CompatibilityDetail = {
  supportedVersions: string[];
};

interface DependencyIdentity {
  projectId: string;
  slug: string;
  title: string;
}

type DetailTab = 'info' | 'readme';

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

export default function PluginBrowser({ server }: Props) {
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
  const detailRequestIdRef = useRef(0);

  const isModServer = ['Fabric', 'Forge', 'NeoForge'].includes(server.software || '');
  const [platform, setPlatform] = useState<BrowserPlatform>('Modrinth');
  const isPaper = ['Paper', 'LeafMC', 'Waterfall', 'Velocity'].includes(server.software || '');
  const { showToast } = useToast();
  const folderName = isModServer ? 'mods' : 'plugins';

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
        logoUrl: 'https://hangar.papermc.io/favicon.ico',
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

  const refreshInstalled = async () => {
    try {
      const dirPath = `${server.path}/${folderName}`;
      const entries = await listFiles(dirPath);
      setInstalledFiles(entries.filter((entry) => !entry.isDirectory).map((entry) => entry.name));
    } catch (error) {
      console.error(error);
      setInstalledFiles([]);
    }
  };

  useEffect(() => {
    if (isInAppSearch) {
      void search();
      return;
    }

    setLoading(false);
    setHasNextPage(false);
    setTotalPages(null);
    setResults([]);
  }, [page, platform, isInAppSearch]);

  useEffect(() => {
    setPageInput(String(page + 1));
  }, [page]);

  useEffect(() => {
    void refreshInstalled();
  }, [server.id, server.path, isModServer]);

  useEffect(() => {
    let cancelled = false;

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
      const updates = await Promise.all(
        results.map(async (item): Promise<[string, CompatibilityStatus, CompatibilityDetail]> => {
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
            console.error(error);
            return [item.id, 'unknown', { supportedVersions: [] }];
          }
        }),
      );

      if (cancelled) {
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
    };
  }, [isInAppSearch, results, server.software, server.version]);

  useEffect(() => {
    let cancelled = false;

    if (!isInAppSearch || results.length === 0) {
      setUpdateStatusByItemId({});
      setLatestFileByItemId({});
      return;
    }

    const installedTargets = results
      .map((item) => {
        const installedMatch = findInstalledMatch(item);
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
      const updates = await Promise.all(
        installedTargets.map(
          async ({ item, installedMatch }): Promise<[string, UpdateStatus, string | null]> => {
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
              console.error(error);
              return [item.id, 'unknown', null];
            }
          },
        ),
      );

      if (cancelled) {
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
    if (!normalizedCandidate) {
      return false;
    }

    return installedFiles.some((file) => {
      const normalizedFile = normalize(file);
      return (
        normalizedFile.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedFile)
      );
    });
  };

  const findInstalledMatch = (item: ProjectItem) => {
    const candidates = [
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

    return (
      installedFiles.find((file) => {
        const base = normalize(file);
        const fileLower = file.toLowerCase();
        const fileBase = fileLower.replace(/\.[^.]+$/, '').replace(/-[\d.]+$/, '');

        if (candidates.some((candidate) => base.includes(candidate) || candidate.includes(base))) {
          return true;
        }

        if (
          plainCandidates.some(
            (candidate) => fileLower.includes(candidate) || fileBase === candidate,
          )
        ) {
          return true;
        }

        return false;
      }) || null
    );
  };

  const resolveDependencyIdentity = async (projectId: string): Promise<DependencyIdentity> => {
    const cached = dependencyIdentityCacheRef.current[projectId];
    if (cached) {
      return cached;
    }

    let identity: ModrinthProjectIdentity | null = null;
    try {
      identity = await getModrinthProjectIdentity(projectId);
    } catch (error) {
      console.error(error);
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
          .map((hit) => ({
            id: hit.project_id || hit.slug,
            title: hit.title,
            description: hit.description,
            author: hit.author || 'Unknown',
            icon_url: hit.icon_url || undefined,
            downloads: hit.downloads || undefined,
            slug: hit.slug || hit.project_id || '',
            platform: 'Modrinth' as const,
            source_obj: {
              ...hit,
            },
          }))
          .filter((item) => Boolean(item.id));

        setHasNextPage(result.total_hits > offset + items.length);
        setTotalPages(Math.max(1, Math.ceil(result.total_hits / LIMIT)));
      } else if (platform === 'Hangar') {
        const data = await searchHangar(query, offset);

        items = data.result.map((project) => ({
          id: `${project.namespace.owner}/${project.namespace.slug}`,
          title: project.name,
          description: project.description,
          author: project.namespace.owner,
          icon_url: project.avatarUrl || undefined,
          stars: project.stats.stars || undefined,
          downloads: project.stats.downloads || undefined,
          slug: project.namespace.slug,
          platform: 'Hangar' as const,
          source_obj: {
            ...project,
          },
        }));

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
      console.error(error);
      setHasNextPage(false);
      setTotalPages(null);
      const message = toErrorMessage(error);
      if (platform === 'Hangar') {
        showToast(`Hangarの取得に失敗しました: ${message}`, 'error');
      } else if (platform === 'Spigot') {
        showToast(`Spigotの取得に失敗しました: ${message}`, 'error');
      } else {
        showToast('データの取得に失敗しました', 'error');
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
    if (installedFile) {
      const targetPath = `${server.path}/${folderName}/${installedFile}`;
      try {
        await deleteItem(targetPath);
      } catch (error) {
        console.error(error);
        showToast('既存ファイルの削除に失敗しました', 'error');
        return;
      }
    }

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
          showToast('対応バージョンが見つかりませんでした', 'error');
          return;
        }

        const requiredProjectIds = Array.from(
          new Set(
            resolvedVersion.dependencies
              .filter(
                (dependency) =>
                  dependency.dependencyType.toLowerCase() === 'required' &&
                  typeof dependency.projectId === 'string',
              )
              .map((dependency) => dependency.projectId as string),
          ),
        );

        if (requiredProjectIds.length > 0) {
          const requiredProjects = await Promise.all(
            requiredProjectIds.map((projectId) => resolveDependencyIdentity(projectId)),
          );

          const missingDependencies = requiredProjects.filter(
            (dependency) =>
              !isCandidateInstalled(dependency.slug) &&
              !isCandidateInstalled(dependency.title) &&
              !isCandidateInstalled(dependency.projectId),
          );

          if (missingDependencies.length > 0) {
            const preview = missingDependencies
              .slice(0, 3)
              .map((dependency) => dependency.title)
              .join(', ');
            const suffix = missingDependencies.length > 3 ? ', ...' : '';

            const shouldInstallDependencies = await ask(
              `不足依存プラグインが ${missingDependencies.length} 件あります。\n${preview}${suffix}\n先に一括インストールしますか？`,
              {
                title: '依存関係チェック',
                kind: 'warning',
              },
            );

            if (shouldInstallDependencies) {
              let installedDependencyCount = 0;
              for (const dependency of missingDependencies) {
                try {
                  const dependencyVersion = await getCompatibleModrinthVersion({
                    projectId: dependency.projectId,
                    loader,
                    minecraftVersion: server.version,
                  });

                  if (!dependencyVersion) {
                    showToast(
                      `依存プラグイン ${dependency.title} の対応バージョンが見つかりません`,
                      'info',
                    );
                    continue;
                  }

                  await installModrinthProject(
                    dependencyVersion.id,
                    dependencyVersion.fileName,
                    `${server.path}/${folderName}`,
                  );
                  installedDependencyCount += 1;
                } catch (error) {
                  console.error(error);
                  showToast(`依存プラグイン ${dependency.title} の導入に失敗しました`, 'error');
                }
              }

              if (installedDependencyCount > 0) {
                showToast(
                  `依存プラグインを ${installedDependencyCount} 件インストールしました`,
                  'success',
                );
                await refreshInstalled();
              }
            } else {
              showToast(
                '依存関係チェックのみ実行しました。必要に応じて先に依存プラグインを導入してください。',
                'info',
              );
            }
          }
        }

        await installModrinthProject(
          resolvedVersion.id,
          resolvedVersion.fileName,
          `${server.path}/${folderName}`,
        );
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
          showToast('対応バージョンが見つかりませんでした', 'error');
          return;
        }

        if (!resolved.compatible) {
          const listedVersions = resolved.supportedVersions.slice(0, 3).join(', ');
          const suffix = resolved.supportedVersions.length > 3 ? ', ...' : '';
          showToast(
            listedVersions
              ? `サーバー ${server.version} との互換性が未確認です (対応候補: ${listedVersions}${suffix})`
              : `サーバー ${server.version} との互換性が未確認です`,
            'info',
          );
        }

        if (!resolved.downloadUrl) {
          const externalUrl = resolved.externalUrl || `https://hangar.papermc.io/${owner}/${slug}`;
          await openExternal(externalUrl);
          showToast('このHangarリソースはブラウザ経由でのダウンロードが必要です', 'info');
          return;
        }

        await installHangarProject(
          resolved.downloadUrl,
          resolved.fileName,
          `${server.path}/${folderName}`,
        );
      } else if (item.platform === 'Spigot') {
        const resourceId = Number(item.id);
        if (!Number.isFinite(resourceId)) {
          showToast('SpigotリソースIDが不正です', 'error');
          return;
        }

        const shouldOpenBrowser =
          item.source_obj.external === true || item.source_obj.premium === true;
        if (shouldOpenBrowser) {
          await openExternal(`https://www.spigotmc.org/resources/${resourceId}/`);
          showToast('このリソースはブラウザ経由でのダウンロードが必要です', 'info');
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

        await installSpigotProject(resourceId, fileName, `${server.path}/${folderName}`, versionId);
      }

      const successLabel =
        mode === 'fresh'
          ? 'インストール完了'
          : mode === 'overwrite'
            ? '上書き完了'
            : 'アップデート完了';
      showToast(`${successLabel}: ${item.title}`, 'success');
    } catch (error) {
      console.error(error);
      showToast('インストールエラー', 'error');
    } finally {
      setInstallingId(null);
      await refreshInstalled();
    }
  };

  const handleInstall = (item: ProjectItem) => {
    const compatibility = compatibilityByItemId[item.id] ?? 'unknown';
    if (compatibility === 'incompatible') {
      showToast('このプラグインは現在のサーバーバージョンと非互換の可能性があります', 'info');
    }

    const installedMatch = findInstalledMatch(item);
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
      console.error(error);
      showToast('ブラウザを開けませんでした', 'error');
    }
  };

  const handleToggleInstalled = async (item: ProjectItem, installedFile: string) => {
    const sourcePath = `${server.path}/${folderName}/${installedFile}`;
    const nextFile = isDisabledPluginFile(installedFile)
      ? installedFile.replace(/\.disabled$/i, '')
      : `${installedFile}.disabled`;
    const targetPath = `${server.path}/${folderName}/${nextFile}`;

    setInstallingId(item.id);
    try {
      await moveItem(sourcePath, targetPath);
      showToast(
        isDisabledPluginFile(installedFile)
          ? `${item.title} を有効化しました`
          : `${item.title} を無効化しました`,
        'success',
      );
    } catch (error) {
      console.error(error);
      showToast('プラグイン状態の切り替えに失敗しました', 'error');
    } finally {
      setInstallingId(null);
      await refreshInstalled();
    }
  };

  const compatibilityLabel = (status: CompatibilityStatus): string => {
    switch (status) {
      case 'compatible':
        return 'Compatible';
      case 'incompatible':
        return 'Incompatible';
      case 'checking':
        return 'Checking...';
      default:
        return 'Unknown';
    }
  };

  const updateStatusLabel = (status: UpdateStatus): string => {
    switch (status) {
      case 'checking':
        return 'Update: Checking';
      case 'update-available':
        return 'Update Available';
      case 'up-to-date':
        return 'Up to Date';
      default:
        return 'Update: Unknown';
    }
  };

  const actionLabel = (
    item: ProjectItem,
    installedState: 'none' | 'enabled' | 'disabled',
    updateStatus: UpdateStatus | null,
  ) => {
    if (installingId === item.id) {
      return 'Installing...';
    }
    const requiresBrowser =
      item.platform === 'Spigot' &&
      (item.source_obj.external === true || item.source_obj.premium === true);
    if (!requiresBrowser && installedState !== 'none' && updateStatus === 'update-available') {
      return 'Update';
    }
    return requiresBrowser ? 'Open' : 'Install';
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
      return '未公開';
    }
    const preview = versions.slice(0, 6).join(', ');
    return versions.length > 6 ? `${preview}, ...` : preview;
  };

  const loaderLabel = (item: ProjectItem) => {
    if (item.platform === 'Spigot') {
      return 'Spigot / Paper互換';
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

    return isModServer ? server.software || 'Mod loader' : 'Paper / Spigot';
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
        console.error(error);
        if (detailRequestIdRef.current !== requestId) {
          return;
        }
        setDetailError('READMEの取得に失敗しました。時間をおいて再試行してください。');
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
      showToast('ページ番号は 1 以上で入力してください', 'info');
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

  return (
    <div className="plugin-browser">
      <div className="plugin-browser__platform-grid">
        {platformOptions.map((option) => {
          const Icon = option.icon;
          const active = option.key === platform;
          const showLogo = option.logoUrl.length > 0 && !logoLoadFailed[option.key];

          return (
            <motion.button
              key={option.key}
              type="button"
              whileTap={{ scale: 0.97 }}
              whileHover={{ y: -1 }}
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
                placeholder={`Search on ${selectedPlatform?.label || platform}...`}
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
              <span>{loading ? 'Searching...' : 'Search'}</span>
            </button>
          </div>

          <div className="plugin-browser__sort-row">
            <span className="plugin-browser__sort-label">Sort</span>
            <select
              className="plugin-browser__sort-select"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
            >
              <option value="relevance">Relevance</option>
              <option value="downloads">Downloads</option>
              <option value="name">Name</option>
              <option value="compatibility">Compatibility</option>
            </select>
          </div>
        </>
      ) : (
        <div className="plugin-browser__unsupported-panel">
          <p>このプラットフォームはアプリ内検索に対応していません。</p>
          <button
            type="button"
            className="plugin-browser__unsupported-btn"
            onClick={() => openExternal('https://www.curseforge.com/minecraft/mc-mods')}
          >
            <ExternalLink size={16} />
            <span>ブラウザで {selectedPlatform?.label || platform} を開く</span>
          </button>
          <p className="plugin-browser__unsupported-note">
            ダウンロードした .jar は Files から {folderName} フォルダへ配置してください。
          </p>
        </div>
      )}

      {isInAppSearch && platform === 'Spigot' && (
        <div className="plugin-browser__platform-note">
          Spigot にはブラウザ経由でのみ配布されるリソースがあります。Open
          と表示される場合は外部ページから取得してください。
        </div>
      )}

      {isInAppSearch && platform === 'Hangar' && (
        <div className="plugin-browser__platform-note">
          Hangar には直接ダウンロード URL
          を公開していないバージョンがあります。その場合は自動的に外部ページを開きます。
        </div>
      )}

      {isInAppSearch && updateAvailableCount > 0 && (
        <div className="plugin-browser__update-summary">
          <span>{updateAvailableCount} 件の更新候補があります。</span>
          <span className="plugin-browser__update-summary-note">
            Install を押すと更新処理として実行されます。
          </span>
        </div>
      )}

      {isInAppSearch && (
        <>
          <div className="plugin-browser__results-grid">
            <AnimatePresence initial={false}>
              {sortedResults.map((item, index) => {
                const installedMatch = findInstalledMatch(item);
                const installedState = installedMatch
                  ? isDisabledPluginFile(installedMatch)
                    ? 'disabled'
                    : 'enabled'
                  : 'none';
                const compatibility = compatibilityByItemId[item.id] ?? 'unknown';
                const updateStatus = installedMatch
                  ? (updateStatusByItemId[item.id] ?? 'unknown')
                  : null;
                const latestFileName = latestFileByItemId[item.id];
                const requiresBrowser =
                  item.platform === 'Spigot' &&
                  (item.source_obj.external === true || item.source_obj.premium === true);

                return (
                  <motion.div
                    key={`${item.platform}-${item.id}`}
                    layout
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.18, delay: Math.min(index * 0.02, 0.16) }}
                    className="plugin-browser__result-card"
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
                      <div className="plugin-browser__result-top">
                        <div className="plugin-browser__result-title-wrap">
                          <div className="plugin-browser__result-title">{item.title}</div>
                          <div className="plugin-browser__result-source">{item.platform}</div>
                          <div className="plugin-browser__result-flags">
                            <span className={`plugin-browser__compat-badge is-${compatibility}`}>
                              {compatibilityLabel(compatibility)}
                            </span>
                            {installedMatch && updateStatus && (
                              <span
                                className={`plugin-browser__update-badge is-${updateStatus}`}
                                title={
                                  updateStatus === 'update-available' && latestFileName
                                    ? `Latest: ${latestFileName}`
                                    : undefined
                                }
                              >
                                {updateStatusLabel(updateStatus)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="plugin-browser__result-actions">
                          {installedMatch && (
                            <span
                              className={`plugin-browser__installed-badge ${
                                installedState === 'disabled' ? 'is-disabled' : ''
                              }`}
                            >
                              {installedState === 'disabled' ? 'Disabled' : 'Installed'}
                            </span>
                          )}

                          {installedMatch && (
                            <button
                              type="button"
                              onClick={() => void handleToggleInstalled(item, installedMatch)}
                              disabled={installingId === item.id}
                              className={`plugin-browser__toggle-btn ${
                                installedState === 'disabled' ? 'is-enable' : 'is-disable'
                              }`}
                            >
                              {installedState === 'disabled' ? 'Enable' : 'Disable'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleInstall(item)}
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

                          <button
                            type="button"
                            className="plugin-browser__details-btn"
                            onClick={() => openDetailModal(item)}
                          >
                            Details
                          </button>
                        </div>
                      </div>

                      <div className="plugin-browser__result-description">
                        {item.description || 'No description provided.'}
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
                        <div className="plugin-browser__result-tag">External download required</div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {sortedResults.length === 0 && !loading && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="plugin-browser__result-empty"
                >
                  結果がありません。
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
              <span>Prev</span>
            </button>

            <span className="plugin-browser__pager-label">
              Page {page + 1}
              {totalPages ? ` / ${totalPages}` : ''}
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
                aria-label="page number"
              />
              <button
                type="button"
                className="plugin-browser__pager-go"
                onClick={jumpToPage}
                disabled={loading}
              >
                Go
              </button>
            </div>

            <button
              type="button"
              className="plugin-browser__pager-btn"
              onClick={() => setPage((value) => value + 1)}
              disabled={!hasNextPage || loading}
            >
              <span>Next</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </>
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
                  <span>by {detailItem.author}</span>
                  <span className={`plugin-browser__compat-badge is-${detailCompatibility}`}>
                    {compatibilityLabel(detailCompatibility)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="plugin-browser__detail-close"
                onClick={closeDetailModal}
                aria-label="close details"
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
                Info
              </button>
              <button
                type="button"
                className={`plugin-browser__detail-tab ${detailTab === 'readme' ? 'is-active' : ''}`}
                onClick={() => setDetailTab('readme')}
              >
                README
              </button>
            </div>

            {detailTab === 'info' ? (
              <div className="plugin-browser__detail-info-panel">
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">Project</span>
                  <span className="plugin-browser__detail-value">{detailItem.id}</span>
                </div>
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">Slug</span>
                  <span className="plugin-browser__detail-value">{detailItem.slug || 'N/A'}</span>
                </div>
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">Supported MC</span>
                  <span className="plugin-browser__detail-value">
                    {supportedVersionsLabel(detailItem.id)}
                  </span>
                </div>
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">Loader</span>
                  <span className="plugin-browser__detail-value">{loaderLabel(detailItem)}</span>
                </div>
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">Downloads</span>
                  <span className="plugin-browser__detail-value">
                    {detailItem.downloads ? detailItem.downloads.toLocaleString() : '-'}
                  </span>
                </div>
                <div className="plugin-browser__detail-row">
                  <span className="plugin-browser__detail-key">Summary</span>
                  <span className="plugin-browser__detail-value">
                    {detailItem.description || 'No description provided.'}
                  </span>
                </div>
                <div className="plugin-browser__detail-actions">
                  <button
                    type="button"
                    className="plugin-browser__detail-link-btn"
                    onClick={() => void openExternal(detailProjectUrl)}
                  >
                    <ExternalLink size={14} />
                    <span>Project Page</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="plugin-browser__detail-readme-panel">
                {detailLoading ? (
                  <div className="plugin-browser__detail-readme-empty">
                    <Loader2 size={15} className="animate-spin" />
                    <span>READMEを取得中です...</span>
                  </div>
                ) : detailError ? (
                  <div className="plugin-browser__detail-readme-empty is-error">{detailError}</div>
                ) : detailReadme ? (
                  <div className="plugin-browser__detail-readme-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{detailReadme}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="plugin-browser__detail-readme-empty">
                    このプロジェクトにはREADME本文が公開されていません。
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
            <h3 className="plugin-browser__dup-title">既にインストール済みです</h3>
            <p className="plugin-browser__dup-description">
              {dupDialog.item.title} は既に {folderName} フォルダに存在します。どうしますか？
            </p>

            <div className="plugin-browser__dup-file">既存ファイル: {dupDialog.installedFile}</div>

            <div className="plugin-browser__dup-notes">
              <div>・上書き: そのまま置き換えます。</div>
              <div>・アップデート: サーバーバージョンに合う最新ビルドを入れ直します。</div>
            </div>

            <div className="plugin-browser__dup-actions">
              <button
                type="button"
                className="plugin-browser__dup-btn plugin-browser__dup-btn--cancel"
                onClick={() => setDupDialog(null)}
              >
                キャンセル
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
                上書き
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
                アップデート
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
