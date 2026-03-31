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
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteItem, listFiles, moveItem } from '../../lib/file-commands';
import {
  checkHangarCompatibility,
  getCompatibleModrinthVersion,
  getModrinthProjectIdentity,
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

interface DependencyIdentity {
  projectId: string;
  slug: string;
  title: string;
}

const MINECRAFT_VERSION_REGEX = /\b1\.\d+(?:\.\d+)?\b/g;

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

function isDisabledPluginFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.disabled');
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

export default function PluginBrowser({ server }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState<Record<string, boolean>>({});
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedFiles, setInstalledFiles] = useState<string[]>([]);
  const [dupDialog, setDupDialog] = useState<{ item: ProjectItem; installedFile: string } | null>(
    null
  );
  const [page, setPage] = useState(0);
  const [compatibilityByItemId, setCompatibilityByItemId] = useState<
    Record<string, CompatibilityStatus>
  >({});
  const dependencyIdentityCacheRef = useRef<Record<string, DependencyIdentity>>({});

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
        logoUrl: 'https://docs.papermc.io/img/paper.png',
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
    setResults([]);
  }, [page, platform, isInAppSearch]);

  useEffect(() => {
    void refreshInstalled();
  }, [server.id, server.path, isModServer]);

  useEffect(() => {
    let cancelled = false;

    if (!isInAppSearch || results.length === 0) {
      setCompatibilityByItemId({});
      return;
    }

    const initial: Record<string, CompatibilityStatus> = {};
    for (const item of results) {
      if (item.platform === 'Modrinth') {
        initial[item.id] = 'compatible';
      } else if (item.platform === 'Spigot') {
        initial[item.id] = inferSpigotCompatibility(item);
      } else {
        initial[item.id] = 'checking';
      }
    }
    setCompatibilityByItemId(initial);

    const run = async () => {
      const updates = await Promise.all(
        results.map(async (item): Promise<[string, CompatibilityStatus]> => {
          if (item.platform !== 'Hangar') {
            return [item.id, initial[item.id] ?? 'unknown'];
          }

          try {
            const compatibility = await checkHangarCompatibility({
              owner: item.author,
              slug: item.slug || item.title,
              software: server.software || 'Paper',
              minecraftVersion: server.version || '',
            });

            if (compatibility.supportedVersions.length === 0) {
              return [item.id, 'unknown'];
            }

            return [item.id, compatibility.compatible ? 'compatible' : 'incompatible'];
          } catch (error) {
            console.error(error);
            return [item.id, 'unknown'];
          }
        })
      );

      if (cancelled) {
        return;
      }

      const next: Record<string, CompatibilityStatus> = { ...initial };
      for (const [id, status] of updates) {
        next[id] = status;
      }
      setCompatibilityByItemId(next);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [isInAppSearch, results, server.software, server.version]);

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
            (candidate) => fileLower.includes(candidate) || fileBase === candidate
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
      } else if (platform === 'Spigot') {
        const resources = await searchSpigot(query, page + 1, LIMIT);
        items = resources.map(mapSpigotResource);
        setHasNextPage(items.length === LIMIT);
      }

      setResults(items);
    } catch (error) {
      console.error(error);
      setHasNextPage(false);
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
    installedFile?: string
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
                  typeof dependency.projectId === 'string'
              )
              .map((dependency) => dependency.projectId as string)
          )
        );

        if (requiredProjectIds.length > 0) {
          const requiredProjects = await Promise.all(
            requiredProjectIds.map((projectId) => resolveDependencyIdentity(projectId))
          );

          const missingDependencies = requiredProjects.filter(
            (dependency) =>
              !isCandidateInstalled(dependency.slug) &&
              !isCandidateInstalled(dependency.title) &&
              !isCandidateInstalled(dependency.projectId)
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
              }
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
                      'info'
                    );
                    continue;
                  }

                  await installModrinthProject(
                    dependencyVersion.id,
                    dependencyVersion.fileName,
                    `${server.path}/${folderName}`
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
                  'success'
                );
                await refreshInstalled();
              }
            } else {
              showToast(
                '依存関係チェックのみ実行しました。必要に応じて先に依存プラグインを導入してください。',
                'info'
              );
            }
          }
        }

        await installModrinthProject(
          resolvedVersion.id,
          resolvedVersion.fileName,
          `${server.path}/${folderName}`
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
            'info'
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
          `${server.path}/${folderName}`
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
          typeof item.source_obj.fileType === 'string' ? item.source_obj.fileType : '.jar'
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
        'success'
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

  const actionLabel = (item: ProjectItem) => {
    if (installingId === item.id) {
      return 'Installing...';
    }
    const requiresBrowser =
      item.platform === 'Spigot' &&
      (item.source_obj.external === true || item.source_obj.premium === true);
    return requiresBrowser ? 'Open' : 'Install';
  };

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

      {isInAppSearch && (
        <>
          <div className="plugin-browser__results-grid">
            <AnimatePresence initial={false}>
              {results.map((item, index) => {
                const installedMatch = findInstalledMatch(item);
                const installedState = installedMatch
                  ? isDisabledPluginFile(installedMatch)
                    ? 'disabled'
                    : 'enabled'
                  : 'none';
                const compatibility = compatibilityByItemId[item.id] ?? 'unknown';
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
                            <span>{actionLabel(item)}</span>
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

              {results.length === 0 && !loading && (
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

            <span className="plugin-browser__pager-label">Page {page + 1}</span>

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
