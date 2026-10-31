import { useQueries, useQuery } from '@tanstack/react-query';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Alert } from '@/components/arc/alert/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs';
import { ExternalLink, Flame, Package, Server } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import paperLogoUrl from '../../assets/papermc_logo.svg';
import { useTranslation } from '../../i18n';
import { logError } from '../../lib/error-utils';
import { listFiles } from '../../lib/file-commands';
import {
  checkHangarCompatibility,
  getCompatibleModrinthVersion,
  getHangarProjectBody,
  getModrinthProjectBody,
  getSpigotResourceBody,
  resolveHangarDownload,
  searchHangar,
  searchModrinth,
  searchSpigot,
} from '../../lib/plugin-commands';
import {
  executePluginInstall,
  onPluginInstallProgress,
  preparePluginInstall,
  toggleInstalledPlugin,
  uninstallInstalledPlugin,
  type PluginProjectRef,
} from '../../lib/plugin-installer-commands';
import {
  type PluginInstallFailureCode,
  classifyPluginInstallFailure,
} from '../../lib/plugin-install-errors';
import { useGuardedViewNavigation } from '../hooks/use-guarded-view-navigation';
import type { MinecraftServer } from '../components/../shared/server declaration';
import {
  pluginInstallFailurePresentation,
  shouldBlockPluginInstall,
} from '../shared/plugin-install-policy';
import { notify } from '../shared/notify';
import { useAppFeedback } from './AppFeedbackProvider';
import { PluginInstallList, type PluginInstallItem } from './PluginInstallList';
import { PluginDetailDialog } from './plugin-browser/PluginDetailDialog';
import { PluginInstalledPanel } from './plugin-browser/PluginInstalledPanel';
import { PluginPlatformSwitch, type PlatformOption } from './plugin-browser/PluginPlatformSwitch';
import { PluginSearchPanel } from './plugin-browser/PluginSearchPanel';
import type { PluginResultCardState } from './plugin-browser/PluginResultCard';
import styles from './plugin-browser/plugin-browser.module.css';
import {
  ASYNC_CHECK_CONCURRENCY,
  type BrowserPlatform,
  type BrowserSection,
  type CompatibilityDetail,
  type CompatibilityStatus,
  type InstalledPluginEntry,
  LIMIT,
  type ProjectItem,
  type SortMode,
  type UpdateStatus,
  buildInstalledMetadataLookupCandidates,
  collectPluginFileNames,
  extractLoaderHintsFromUnknown,
  extractVersionHints,
  formatInstalledTitle,
  inferInstalledFileVersion,
  isAllowedPluginBrowserUrl,
  isDisabledPluginFile,
  isLikelyVersionSuffix,
  mapHangarProject,
  mapModrinthProject,
  mapSpigotResource,
  mapWithConcurrency,
  normalizeInstalledPluginFileName,
  normalizeReadme,
  projectPageUrl,
  toSlug,
} from './plugin-browser/plugin-model';

interface Props {
  server: MinecraftServer;
}

export default function PluginBrowser({ server }: Props) {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<BrowserSection>('browse');
  const [query, setQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [pageInput, setPageInput] = useState('1');
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [logoLoadFailed, setLogoLoadFailed] = useState<Record<string, boolean>>({});
  const [installingId, setInstallingId] = useState<string | null>(null);
  // Set while the install preview is fetched. It is not "installing": the user has not confirmed anything yet.
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [installFailureByItemId, setInstallFailureByItemId] = useState<
    Record<string, PluginInstallFailureCode>
  >({});
  const [installProgressByItemId, setInstallProgressByItemId] = useState<Record<string, number>>(
    {},
  );
  const [detailItem, setDetailItem] = useState<ProjectItem | null>(null);
  const [detailReadme, setDetailReadme] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [installedFiles, setInstalledFiles] = useState<string[]>([]);
  const [knownItemsByInstalledFile, setKnownItemsByInstalledFile] = useState<
    Record<string, ProjectItem>
  >({});
  const [busyInstalledFile, setBusyInstalledFile] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [updateStatusByItemId, setUpdateStatusByItemId] = useState<Record<string, UpdateStatus>>(
    {},
  );
  const [latestFileByItemId, setLatestFileByItemId] = useState<Record<string, string>>({});
  const detailReadmeCacheRef = useRef<Record<string, string | null>>({});
  const installedMetadataLookupStateRef = useRef<Record<string, 'resolved' | 'miss'>>({});
  const detailRequestIdRef = useRef(0);
  const updateStatusRequestIdRef = useRef(0);

  const isModServer = ['Fabric', 'Forge', 'NeoForge'].includes(server.software || '');
  const [platform, setPlatform] = useState<BrowserPlatform>('Modrinth');
  const isPaper = ['Paper', 'LeafMC', 'Waterfall', 'Velocity'].includes(server.software || '');
  const { confirm, openDialog } = useAppFeedback();
  const setCurrentView = useGuardedViewNavigation();
  const folderName = isModServer ? 'mods' : 'plugins';

  const platformOptions = useMemo<PlatformOption[]>(() => {
    const options: PlatformOption[] = [
      {
        key: 'Modrinth',
        label: 'Modrinth',
        hint: isModServer
          ? t('plugins.browser.hintModrinthMods')
          : t('plugins.browser.hintModrinthPlugins'),
        inApp: true,
        icon: Package,
        logoUrl: 'https://modrinth.com/favicon.ico',
      },
    ];

    if (isPaper) {
      options.push({
        key: 'Hangar',
        label: 'Hangar',
        hint: t('plugins.browser.hintHangar'),
        inApp: true,
        icon: Server,
        logoUrl: paperLogoUrl,
      });
    }

    if (!isModServer) {
      options.push({
        key: 'Spigot',
        label: 'SpigotMC',
        hint: t('plugins.browser.hintSpigot'),
        inApp: true,
        icon: Flame,
        logoUrl: 'https://www.spigotmc.org/favicon.ico',
      });
    }

    if (isModServer) {
      options.push({
        key: 'CurseForge',
        label: 'CurseForge',
        hint: t('plugins.browser.hintOpenWeb'),
        inApp: false,
        icon: ExternalLink,
        logoUrl: 'https://www.curseforge.com/favicon.ico',
      });
    }

    return options;
  }, [isModServer, isPaper, t]);

  // Keep the current query when the available platform set changes.
  useEffect(() => {
    if (!platformOptions.some((option) => option.key === platform)) {
      setPlatform(platformOptions[0]?.key ?? 'Modrinth');
      setPage(0);
      setCommittedQuery(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setPageInput(String(page + 1));
  }, [page]);

  // Refresh only when the selected server or plugin folder changes.
  useEffect(() => {
    void refreshInstalled();
    setKnownItemsByInstalledFile({});
    installedMetadataLookupStateRef.current = {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, server.path, isModServer]);

  // React Query: search results
  const searchQuery = useQuery({
    queryKey: [
      'plugin-search',
      platform,
      committedQuery,
      page,
      server.id,
      server.path,
      server.version,
      isModServer,
    ] as const,
    queryFn: async ({ signal }) => {
      const offset = page * LIMIT;
      if (platform === 'Modrinth') {
        const searchType = isModServer ? 'mod' : 'plugin';
        const facets = `[["project_type:${searchType}"]]`;
        const result = await searchModrinth(
          committedQuery,
          facets,
          offset,
          LIMIT,
          signal,
          server.version,
        );
        const items = result.hits
          .map(mapModrinthProject)
          .filter((item): item is ProjectItem => item !== null);
        return {
          items,
          hasNextPage: result.total_hits > offset + items.length,
          totalPages: Math.max(1, Math.ceil(result.total_hits / LIMIT)) as number | null,
        };
      }
      if (platform === 'Hangar') {
        const data = await searchHangar(committedQuery, offset, signal);
        const items = data.result.map(mapHangarProject);
        return { items, hasNextPage: items.length === LIMIT, totalPages: null as number | null };
      }
      const resources = await searchSpigot(committedQuery, page + 1, LIMIT, signal, server.version);
      const items = resources.map(mapSpigotResource);
      return { items, hasNextPage: items.length === LIMIT, totalPages: null as number | null };
    },
    enabled: isInAppSearch && activeSection === 'browse',
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 1_000),
    refetchOnWindowFocus: false,
    // Only reuse the previous data for the same provider; another provider's hits must never show as this one's.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === platform &&
      previousQuery.queryKey[4] === server.id &&
      previousQuery.queryKey[5] === server.path &&
      previousQuery.queryKey[6] === server.version
        ? previous
        : undefined,
  });

  const searchIdentity = `${server.id}\u0000${server.path}\u0000${server.version}\u0000${platform}`;
  const lastSuccessfulSearchRef = useRef<{
    identity: string;
    data: NonNullable<typeof searchQuery.data>;
  } | null>(null);
  useEffect(() => {
    if (searchQuery.data && !searchQuery.isError) {
      lastSuccessfulSearchRef.current = {
        identity: searchIdentity,
        data: searchQuery.data,
      };
    }
  }, [searchIdentity, searchQuery.data, searchQuery.isError]);

  const retainedData =
    lastSuccessfulSearchRef.current?.identity === searchIdentity
      ? lastSuccessfulSearchRef.current.data
      : undefined;
  const searchData = searchQuery.data ?? retainedData;
  const results = searchData?.items ?? [];
  const loading = searchQuery.isFetching;
  const hasNextPage = searchData?.hasNextPage ?? false;
  const totalPages = searchData?.totalPages ?? null;

  // React Query: Hangar compatibility checks (parallel, auto-cached)
  const hangarItems = results.filter((item) => item.platform === 'Hangar');

  const compatibilityQueries = useQueries({
    queries: hangarItems.map((item) => ({
      queryKey: ['hangar-compat', item.id, server.software, server.version] as const,
      queryFn: () =>
        checkHangarCompatibility({
          owner: item.author,
          slug: item.slug || item.title,
          software: server.software || 'Paper',
          minecraftVersion: server.version || '',
        }),
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Provider results own eligibility; React only presents the returned status.
  const { compatibilityByItemId, compatibilityDetailByItemId } = useMemo(() => {
    const byId: Record<string, CompatibilityStatus> = {};
    const detailById: Record<string, CompatibilityDetail> = {};

    for (const item of results) {
      if (item.platform === 'Modrinth' || item.platform === 'Spigot') {
        byId[item.id] = item.compatibility ?? 'unknown';
        detailById[item.id] = { supportedVersions: item.supportedVersions ?? [] };
      }
    }

    hangarItems.forEach((item, i) => {
      const q = compatibilityQueries[i];
      if (!q || q.isPending) {
        byId[item.id] = 'checking';
        detailById[item.id] = { supportedVersions: [] };
      } else if (q.isError || !q.data) {
        byId[item.id] = 'unknown';
        detailById[item.id] = { supportedVersions: [] };
      } else {
        const compat = q.data;
        byId[item.id] = compat.compatibility;
        detailById[item.id] = { supportedVersions: compat.supportedVersions };
      }
    });

    return { compatibilityByItemId: byId, compatibilityDetailByItemId: detailById };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, hangarItems, compatibilityQueries, server.version]);

  // Update checks are keyed by the current search and installed-file snapshots.
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

            return [item.id, status, latestFileName];
          } catch (error) {
            logError('Failed to resolve plugin update status', error, {
              itemId: item.id,
              itemTitle: item.title,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInAppSearch, results, installedFiles, server.software, server.version]);

  const normalize = (text?: unknown) =>
    String(text ?? '')
      .toLowerCase()
      .replace(/\.disabled$/g, '')
      .replace(/\.jar$/g, '')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]/g, '');

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

  // Matching intentionally uses the current installed-file resolver closures.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, installedFiles]);

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

  // Installed metadata checks are keyed by the derived installed entries.
  useEffect(() => {
    if (activeSection !== 'installed') return;
    let cancelled = false;

    const targets = installedEntries.filter(
      (e) => e.sourceItem && e.sourceItem.platform !== 'Spigot',
    );
    if (targets.length === 0) return;

    const needsCheck = targets.filter(
      (e) => !e.sourceItem || !updateStatusByItemId[e.sourceItem.id],
    );
    if (needsCheck.length === 0) return;

    for (const entry of needsCheck) {
      if (entry.sourceItem) {
        const itemId = entry.sourceItem.id;
        setUpdateStatusByItemId((prev) => ({ ...prev, [itemId]: 'checking' }));
      }
    }

    const run = async () => {
      await mapWithConcurrency(needsCheck, ASYNC_CHECK_CONCURRENCY, async (entry) => {
        if (cancelled || !entry.sourceItem) return;
        const item = entry.sourceItem;
        try {
          let latestFileName: string | null = null;
          if (item.platform === 'Modrinth') {
            const resolved = await getCompatibleModrinthVersion({
              projectId: item.id,
              loader: (server.software || '').toLowerCase(),
              minecraftVersion: server.version,
            });
            latestFileName = resolved?.fileName ?? null;
          } else if (item.platform === 'Hangar') {
            const resolved = await resolveHangarDownload({
              owner: item.author,
              slug: item.slug || item.title,
              software: server.software || 'Paper',
              minecraftVersion: server.version || '',
            });
            latestFileName = resolved?.fileName ?? null;
          }

          const normalizedInstalled = normalizeInstalledPluginFileName(entry.fileName);
          const status: UpdateStatus = latestFileName
            ? normalizedInstalled === latestFileName.toLowerCase()
              ? 'up-to-date'
              : 'update-available'
            : 'unknown';

          if (!cancelled) {
            setUpdateStatusByItemId((prev) => ({ ...prev, [item.id]: status }));
            if (latestFileName) {
              const resolvedLatestFileName = latestFileName;
              setLatestFileByItemId((prev) => ({
                ...prev,
                [item.id]: resolvedLatestFileName,
              }));
            }
          }
        } catch (error) {
          logError('Failed to check installed plugin update', error, { itemId: item.id });
          if (!cancelled) {
            setUpdateStatusByItemId((prev) => ({ ...prev, [item.id]: 'unknown' }));
          }
        }
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, installedEntries, server.software, server.version]);

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

  const openIncompatiblePluginDialog = (item: ProjectItem, previewVersions?: string[]) => {
    const supportedVersions =
      previewVersions ?? compatibilityDetailByItemId[item.id]?.supportedVersions ?? [];
    void openDialog({
      severity: 'warning',
      title: t('plugins.browser.incompatibleInstallTitle'),
      description: t('plugins.browser.incompatibleInstallDescription', {
        title: item.title,
        software: server.software || 'Paper',
        version: server.version,
        supportedVersions:
          supportedVersions.length > 0
            ? supportedVersions.slice(0, 8).join(', ')
            : t('plugins.browser.versionsNotPublished'),
      }),
    });
  };

  const installFailureCopy = (code: PluginInstallFailureCode) => {
    switch (code) {
      case 'unverified-artifact-blocked':
        return {
          title: t('plugins.browser.unverifiedInstallTitle'),
          description: t('plugins.browser.unverifiedInstallDescription'),
        };
      case 'checksum-mismatch':
      case 'checksum-invalid':
        return {
          title: t('plugins.browser.checksumInstallTitle'),
          description: t('plugins.browser.checksumInstallDescription'),
        };
      case 'source-rejected':
        return {
          title: t('plugins.browser.sourceInstallTitle'),
          description: t('plugins.browser.sourceInstallDescription'),
        };
      case 'destination-rejected':
        return {
          title: t('plugins.browser.destinationInstallTitle'),
          description: t('plugins.browser.destinationInstallDescription'),
        };
      case 'size-limit-exceeded':
        return {
          title: t('plugins.browser.sizeInstallTitle'),
          description: t('plugins.browser.sizeInstallDescription'),
        };
      case 'network':
        return {
          title: '',
          description: t('plugins.browser.networkInstallError'),
        };
      default:
        return {
          title: '',
          description: t('plugins.browser.unknownInstallError'),
        };
    }
  };

  const handleInstallFailure = (item: ProjectItem, error: unknown) => {
    const failure = classifyPluginInstallFailure(error);
    setInstallFailureByItemId((previous) => ({ ...previous, [item.id]: failure.code }));

    const presentation = pluginInstallFailurePresentation(failure.code);
    if (presentation !== 'dialog') {
      return;
    }

    const copy = installFailureCopy(failure.code);
    const isUnverified = failure.code === 'unverified-artifact-blocked';
    void openDialog({
      severity: 'error',
      title: copy.title,
      description: copy.description,
      // One button only: the dialog is informational, and the settings link is its single action.
      secondaryAction: isUnverified
        ? {
            label: t('plugins.browser.openGeneralSettings'),
            onSelect: () => setCurrentView('app-settings'),
          }
        : undefined,
    });
  };

  const performInstall = async (
    item: ProjectItem,
    mode: 'fresh' | 'overwrite' | 'update',
    installedFile?: string,
  ) => {
    if (shouldBlockPluginInstall(compatibilityByItemId[item.id] ?? 'unknown')) {
      openIncompatiblePluginDialog(item);
      return;
    }

    setInstallFailureByItemId((previous) => {
      const next = { ...previous };
      delete next[item.id];
      return next;
    });
    setPreparingId(item.id);
    try {
      let project: PluginProjectRef;
      if (item.platform === 'Modrinth') {
        project = { provider: 'modrinth', projectId: item.id };
      } else if (item.platform === 'Hangar') {
        project = {
          provider: 'hangar',
          owner: item.author,
          slug: item.slug || item.title,
        };
      } else if (item.platform === 'Spigot') {
        const resourceId = Number(item.id);
        if (!Number.isSafeInteger(resourceId) || resourceId <= 0) {
          handleInstallFailure(item, new Error('Invalid plugin source URL'));
          return;
        }
        project = { provider: 'spiget', resourceId };
      } else {
        throw new Error('Unsupported plugin provider');
      }

      const preview = await preparePluginInstall(server.id, project, installedFile);
      if (preview.externalUrl) {
        await openExternal(preview.externalUrl);
        return;
      }
      if (!preview.token || preview.artifacts.length === 0) {
        throw new Error('Plugin installation preview is incomplete');
      }

      const incompatibleArtifact = preview.artifacts.find(
        (artifact) => artifact.compatibility === 'incompatible',
      );
      if (incompatibleArtifact) {
        openIncompatiblePluginDialog(item, incompatibleArtifact.supportedVersions);
        return;
      }

      const confirmedDependencies = new Set(preview.missingDependencyIds);
      const installArtifacts = preview.artifacts.filter(
        (artifact) => !artifact.dependency || confirmedDependencies.has(artifact.id),
      );
      const unverifiedWarning = preview.requiresUnverifiedDownloads
        ? t('plugins.browser.installPlanUnverifiedWarning')
        : '';
      const unknownCompatibilityWarning = installArtifacts.some(
        (artifact) => artifact.compatibility === 'unknown',
      )
        ? t('plugins.browser.installPlanUnknownCompatibility')
        : '';
      const dependencyNames = installArtifacts
        .filter((artifact) => artifact.dependency)
        .map((artifact) => artifact.title);
      // Only the plugin itself has the icon from the results. Dependencies have none and fall back to a monogram.
      const installItems: PluginInstallItem[] = installArtifacts.map((artifact) => ({
        name: artifact.title,
        iconUrl: artifact.dependency ? undefined : item.icon_url,
        detail: artifact.fileName,
      }));
      // The confirm dialog is open from here on, so the card must not read as installing yet.
      setPreparingId(null);
      let accepted = false;
      await openDialog({
        severity: preview.requiresUnverifiedDownloads ? 'warning' : 'info',
        title: t('plugins.browser.installPlanConfirmTitle'),
        body: (
          <div className={styles.confirmBody}>
            <PluginInstallList items={installItems} />
            <p className={styles.caption}>
              {t('plugins.browser.installPlanTarget', { directory: preview.targetDirectory })}
            </p>
            {dependencyNames.length > 0 ? (
              <p className={styles.caption}>
                {t('plugins.browser.installPlanDependencies', {
                  names: dependencyNames.join(', '),
                })}
              </p>
            ) : null}
            {unknownCompatibilityWarning ? (
              <Alert tone="warning" title={unknownCompatibilityWarning} />
            ) : null}
            {unverifiedWarning ? <Alert tone="warning" title={unverifiedWarning} /> : null}
          </div>
        ),
        primaryAction: {
          label: t('plugins.browser.installPlanConfirmButton'),
          onSelect: () => {
            accepted = true;
          },
        },
      });
      if (!accepted) {
        return;
      }

      setInstallingId(item.id);
      setInstallProgressByItemId((previous) => ({ ...previous, [item.id]: 0 }));
      const stopListening = await onPluginInstallProgress(
        preview.token,
        ({ downloaded, total }) => {
          if (total <= 0) {
            return;
          }
          setInstallProgressByItemId((previous) => ({
            ...previous,
            [item.id]: Math.min(100, Math.floor((downloaded / total) * 100)),
          }));
        },
      );
      try {
        await executePluginInstall(preview.token, preview.missingDependencyIds);
      } finally {
        stopListening();
      }

      const successLabel =
        mode === 'fresh'
          ? t('plugins.browser.installSuccess', { title: item.title })
          : mode === 'overwrite'
            ? t('plugins.browser.overwriteSuccess', { title: item.title })
            : t('plugins.browser.updateSuccess', { title: item.title });
      notify.success(successLabel);
    } catch (error) {
      logError('Plugin installation flow failed', error, {
        itemId: item.id,
        itemTitle: item.title,
        mode,
      });
      handleInstallFailure(item, error);
    } finally {
      await refreshInstalled();
      setPreparingId(null);
      setInstallingId(null);
      setInstallProgressByItemId((previous) => {
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
    }
  };

  // Cancel, Escape and a backdrop press keep the installed file. One action is offered: an update when one is
  // known, otherwise an overwrite. The body says what the action does.
  const openAlreadyInstalledDialog = (item: ProjectItem, installedFile: string) => {
    const primary = updateStatusByItemId[item.id] === 'update-available' ? 'update' : 'overwrite';
    void openDialog({
      severity: 'info',
      title: t('plugins.browser.dupTitle'),
      description: t('plugins.browser.dupDescription', { title: item.title, folder: folderName }),
      body: (
        <div className={styles.confirmBody}>
          <p className={styles.caption}>
            {t('plugins.browser.dupExistingFile', { file: installedFile })}
          </p>
          <p className={styles.caption}>
            {primary === 'update'
              ? t('plugins.browser.dupUpdateNote')
              : t('plugins.browser.dupOverwriteNote')}
          </p>
        </div>
      ),
      primaryAction: {
        label:
          primary === 'update' ? t('plugins.browser.dupUpdate') : t('plugins.browser.dupOverwrite'),
        onSelect: () => {
          void performInstall(item, primary, installedFile);
        },
      },
    });
  };

  const handleInstall = (item: ProjectItem) => {
    const compatibility = compatibilityByItemId[item.id] ?? 'unknown';
    if (shouldBlockPluginInstall(compatibility)) {
      openIncompatiblePluginDialog(item);
      return;
    }

    const installedMatch = findInstalledMatchStrict(item);
    if (installedMatch) {
      const updateStatus = updateStatusByItemId[item.id] ?? 'unknown';
      if (updateStatus === 'update-available') {
        void performInstall(item, 'update', installedMatch);
        return;
      }
      openAlreadyInstalledDialog(item, installedMatch);
      return;
    }

    void performInstall(item, 'fresh');
  };

  const openExternal = async (url: string) => {
    try {
      if (!isAllowedPluginBrowserUrl(url)) {
        throw new Error('External plugin URL is not an approved HTTPS provider URL');
      }
      await openUrl(url);
    } catch (error) {
      logError('Failed to open external plugin URL', error, { url });
      void openDialog({
        severity: 'error',
        title: t('plugins.browser.browserOpenError'),
        description: t('plugins.browser.browserOpenErrorDescription'),
      });
    }
  };

  const handleToggleInstalled = async (item: ProjectItem, installedFile: string) => {
    setInstallingId(item.id);
    try {
      const nextFile = await toggleInstalledPlugin(server.id, installedFile);
      notify.success(
        !isDisabledPluginFile(nextFile)
          ? t('plugins.browser.pluginEnabled', { title: item.title })
          : t('plugins.browser.pluginDisabled', { title: item.title }),
      );
    } catch (error) {
      logError('Failed to toggle plugin state', error, {
        itemId: item.id,
        fileName: installedFile,
      });
      void openDialog({
        severity: 'error',
        title: t('plugins.browser.toggleErrorTitle'),
        description: t('plugins.browser.toggleError'),
      });
    } finally {
      await refreshInstalled();
      setInstallingId(null);
    }
  };

  const handleUninstallInstalled = async (entry: InstalledPluginEntry) => {
    setBusyInstalledFile(entry.normalizedFileName);
    try {
      const confirmed = await confirm({
        title: t('plugins.browser.uninstallTitle'),
        description: t('plugins.browser.confirmUninstall', {
          name: entry.displayName || entry.fileName,
        }),
        confirmLabel: t('plugins.browser.uninstall'),
        tone: 'danger',
      });

      if (!confirmed) {
        setBusyInstalledFile(null);
        return;
      }

      await uninstallInstalledPlugin(server.id, entry.fileName);
      notify.success(t('plugins.browser.uninstallSuccess', { title: entry.displayName }));
    } catch (error) {
      logError('Failed to uninstall installed plugin', error, {
        fileName: entry.fileName,
      });
      void openDialog({
        severity: 'error',
        title: t('plugins.browser.uninstallErrorTitle'),
        description: t('plugins.browser.uninstallError'),
      });
    } finally {
      await refreshInstalled();
      setBusyInstalledFile(null);
    }
  };

  const handleReinstallInstalled = (entry: InstalledPluginEntry) => {
    if (!entry.sourceItem) {
      notify.info(t('plugins.browser.reinstallUnavailable'));
      return;
    }
    void performInstall(entry.sourceItem, 'overwrite', entry.fileName);
  };

  const installingLabel = (itemId: string): string => {
    const progress = installProgressByItemId[itemId];
    return progress === undefined
      ? t('plugins.browser.installing')
      : t('plugins.browser.installingProgress', {
          progress,
          label: t('plugins.browser.installing'),
        });
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

  // Sorting intentionally uses the current compatibility lookup closure.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setDetailError(null);
  };

  const openDetailModal = (item: ProjectItem) => {
    setDetailItem(item);
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

  const jumpToPage = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      notify.info(t('plugins.browser.pageInputError'));
      return;
    }

    const targetZeroBased = parsed - 1;
    const clamped = totalPages ? Math.min(totalPages - 1, targetZeroBased) : targetZeroBased;
    setPage(clamped);
  };

  const detailProjectUrl = detailItem ? projectPageUrl(detailItem) : '';
  // Card state for one result, built from the same lookups the install and update paths use.
  const resolveResultCard = (item: ProjectItem): PluginResultCardState => {
    const installedMatch = findInstalledMatchStrict(item);
    const installFailure = installFailureByItemId[item.id];
    return {
      installedState: installedMatch
        ? isDisabledPluginFile(installedMatch)
          ? 'disabled'
          : 'enabled'
        : 'none',
      compatibility: compatibilityByItemId[item.id] ?? 'unknown',
      updateStatus: installedMatch ? (updateStatusByItemId[item.id] ?? 'unknown') : null,
      busy:
        installingId === item.id ? 'installing' : preparingId === item.id ? 'preparing' : 'idle',
      progress: installProgressByItemId[item.id],
      failureMessage:
        installFailure === 'network' || installFailure === 'unknown'
          ? installFailureCopy(installFailure).description
          : null,
    };
  };

  return (
    <div className={styles.root} data-testid="plugin-browser">
      <Tabs
        value={activeSection}
        onValueChange={(value) => setActiveSection(value as BrowserSection)}
      >
        <div className={styles.headerRow}>
          <TabsList aria-label={t('plugins.browser.viewSwitch')}>
            <TabsTrigger value="browse">{t('plugins.browser.tabBrowse')}</TabsTrigger>
            <TabsTrigger value="installed">
              {t('plugins.browser.tabInstalled', { count: installedFiles.length })}
            </TabsTrigger>
          </TabsList>

          {activeSection === 'browse' ? (
            <PluginPlatformSwitch
              value={platform}
              options={platformOptions}
              label={t('plugins.browser.platformLabel')}
              logoFailed={logoLoadFailed}
              onChange={(next) => {
                setPlatform(next);
                setPage(0);
                setCommittedQuery(query);
              }}
              onLogoFailed={(key) => setLogoLoadFailed((prev) => ({ ...prev, [key]: true }))}
            />
          ) : null}
        </div>

        <TabsContent value="browse" className={styles.panel}>
          <PluginSearchPanel
            selectedPlatformLabel={selectedPlatform?.label || platform}
            isInAppSearch={isInAppSearch}
            searchPlatformLabel={searchPlatformLabel}
            query={query}
            onQueryChange={setQuery}
            onSubmitSearch={() => {
              setCommittedQuery(query);
              setPage(0);
            }}
            loading={loading}
            searchFailed={searchQuery.isError}
            onRetrySearch={() => {
              void searchQuery.refetch();
            }}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            onOpenCurseForge={() => {
              void openExternal('https://www.curseforge.com/minecraft/mc-mods');
            }}
            updateAvailableCount={updateAvailableCount}
            results={sortedResults}
            resolveCard={resolveResultCard}
            onInstall={handleInstall}
            onDetails={openDetailModal}
            onRetryInstall={handleInstall}
            page={page}
            totalPages={totalPages}
            hasNextPage={hasNextPage}
            pageInput={pageInput}
            onPageInputChange={setPageInput}
            onJumpToPage={jumpToPage}
            onPageChange={setPage}
          />
        </TabsContent>

        <TabsContent value="installed" className={styles.panel}>
          <PluginInstalledPanel
            folderName={folderName}
            entries={installedEntries}
            updateStatusByItemId={updateStatusByItemId}
            latestFileByItemId={latestFileByItemId}
            installingId={installingId}
            busyInstalledFile={busyInstalledFile}
            installingLabel={installingLabel}
            onUninstall={(entry) => void handleUninstallInstalled(entry)}
            onReinstall={handleReinstallInstalled}
            onToggle={(entry) => void handleToggleInstalled(entry.actionItem, entry.fileName)}
          />
        </TabsContent>
      </Tabs>

      <PluginDetailDialog
        key={detailItem ? `${detailItem.platform}:${detailItem.id}` : 'closed'}
        item={detailItem}
        compatibility={detailItem ? (compatibilityByItemId[detailItem.id] ?? 'unknown') : 'unknown'}
        supportedVersionsLabel={detailItem ? supportedVersionsLabel(detailItem.id) : ''}
        loaderLabel={detailItem ? loaderLabel(detailItem) : ''}
        readme={{ loading: detailLoading, error: detailError, content: detailReadme }}
        onOpenProject={() => void openExternal(detailProjectUrl)}
        onOpenLink={(url) => void openExternal(url)}
        onClose={closeDetailModal}
      />
    </div>
  );
}
