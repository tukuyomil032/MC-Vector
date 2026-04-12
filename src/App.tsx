import { ask } from '@tauri-apps/plugin-dialog';
import { mkdir } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { type JSX, lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  iconBackups,
  iconConsole,
  iconDashboard,
  iconFiles,
  iconMenu,
  iconPlugins,
  iconProperties,
  iconProxy,
  iconSettings,
  iconUsers,
} from './assets/icons';
import { useTranslation } from './i18n';
import { getAppSettings, onConfigChange, saveAppSettings } from './lib/config-commands';
import { readFileContent, saveFileContent } from './lib/file-commands';
// Tauri API ラッパー
import {
  addServer as addServerApi,
  downloadServerJar,
  getServers,
  getServerTemplates,
  type ServerTemplate,
  updateServer as updateServerApi,
} from './lib/server-commands';
import { checkForUpdates, downloadAndInstallUpdate } from './lib/update-commands';
import AddServerModal from './renderer/components/AddServerModal';
import AppContextMenu from './renderer/components/AppContextMenu';
import AppDownloadToast from './renderer/components/AppDownloadToast';
import AppNavItem from './renderer/components/AppNavItem';
import AppServerSidebar from './renderer/components/AppServerSidebar';
import AppUpdateModal from './renderer/components/AppUpdateModal';
import BackupsView from './renderer/components/BackupsView';
import BackupTargetSelectorWindow from './renderer/components/BackupTargetSelectorWindow';
import ConsoleView from './renderer/components/ConsoleView';
import NgrokGuideView from './renderer/components/NgrokGuideView';
import ProxyHelpView from './renderer/components/ProxyHelpView';
import ProxySetupView, { type ProxyNetworkConfig } from './renderer/components/ProxySetupView';
import ViewErrorBoundary from './renderer/components/ViewErrorBoundary';
import PropertiesView from './renderer/components/properties/PropertiesView';
import ServerSettings from './renderer/components/properties/ServerSettings';
import { useToast } from './renderer/components/ToastProvider';
import UsersView from './renderer/components/UsersView';
import { useServerContextActions } from './renderer/hooks/use-server-context-actions';
import { useServerAutomation } from './renderer/hooks/use-server-automation';
import { useServerProcessActions } from './renderer/hooks/use-server-process-actions';
import { useServerRuntimeListeners } from './renderer/hooks/use-server-runtime-listeners';
import { buildAppShellStyle, resolveAppTheme } from './renderer/shared/app-shell-theme';
import { type AppView, type MinecraftServer } from './renderer/shared/server declaration';
import { getHeaderTitle, getViewLabel } from './renderer/shared/view-labels';
import { useConsoleStore } from './store/consoleStore';
import { useServerStore } from './store/serverStore';
import { normalizeAppTheme, useSettingsStore } from './store/settingsStore';
import { useUiStore } from './store/uiStore';

const TAB_CYCLE: AppView[] = [
  'dashboard',
  'console',
  'users',
  'files',
  'plugins',
  'backups',
  'properties',
  'general-settings',
  'proxy',
];

const DashboardView = lazy(() => import('./renderer/components/DashboardView'));
const FilesView = lazy(() => import('./renderer/components/FilesView'));
const PluginBrowser = lazy(() => import('./renderer/components/PluginBrowser'));
const SettingsWindow = lazy(() => import('./renderer/components/SettingsWindow'));

// 外部APIの簡易レスポンスタイプ
type PaperBuildsResponse = {
  builds?: Array<{ build: number; downloads?: { application?: { name?: string } } }>;
};
type MojangManifest = { versions?: Array<{ id: string; url: string }> };
type VerDetail = { downloads?: { server?: { url?: string } } };
type FabricLoader = Array<{ version: string }>;

function App() {
  const { t } = useTranslation();
  const servers = useServerStore((state) => state.servers);
  const setServers = useServerStore((state) => state.setServers);
  const selectedServerId = useServerStore((state) => state.selectedServerId);
  const setSelectedServerId = useServerStore((state) => state.setSelectedServerId);

  const currentView = useUiStore((state) => state.currentView);
  const setCurrentView = useUiStore((state) => state.setCurrentView);
  const showAddServerModal = useUiStore((state) => state.showAddServerModal);
  const setShowAddServerModal = useUiStore((state) => state.setShowAddServerModal);
  const contextMenu = useUiStore((state) => state.contextMenu);
  const setContextMenu = useUiStore((state) => state.setContextMenu);

  const [downloadStatus, setDownloadStatus] = useState<{
    id: string;
    progress: number;
    msg: string;
  } | null>(null);
  const [serverTemplates, setServerTemplates] = useState<ServerTemplate[]>([]);
  const { showToast } = useToast();

  const isSidebarOpen = useUiStore((state) => state.isSidebarOpen);
  const setIsSidebarOpen = useUiStore((state) => state.setIsSidebarOpen);

  const lazyViewFallback = (
    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
      {t('common.loadingView')}
    </div>
  );

  const [updatePrompt, setUpdatePrompt] = useState<{
    version?: string;
    releaseNotes?: unknown;
  } | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const [ngrokData, setNgrokData] = useState<Record<string, string | null>>({});
  const appTheme = useSettingsStore((state) => state.appTheme);
  const setAppTheme = useSettingsStore((state) => state.setAppTheme);
  const systemPrefersDark = useSettingsStore((state) => state.systemPrefersDark);
  const setSystemPrefersDark = useSettingsStore((state) => state.setSystemPrefersDark);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const delta = e.shiftKey ? -1 : 1;
        const idx = TAB_CYCLE.indexOf(currentView);
        const baseIdx = idx === -1 ? 0 : idx;
        const next = TAB_CYCLE[(baseIdx + delta + TAB_CYCLE.length) % TAB_CYCLE.length];
        setCurrentView(next);

        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentView]);

  useEffect(() => {
    const doUpdateCheck = async () => {
      try {
        const result = await checkForUpdates();
        if (result.available) {
          setUpdatePrompt({ version: result.version, releaseNotes: result.body });
          setUpdateReady(false);
        }
      } catch (e) {
        console.error('Update check failed', e);
      }
    };
    doUpdateCheck();
  }, []);

  useEffect(() => {
    const applyNormalizedTheme = async (value: unknown) => {
      const normalizedTheme = normalizeAppTheme(value);
      setAppTheme(normalizedTheme);

      if (value !== undefined && value !== normalizedTheme) {
        try {
          await saveAppSettings({ theme: normalizedTheme });
        } catch (persistError) {
          console.error('Failed to persist normalized app theme', persistError);
        }
      }
    };

    const loadAppSettings = async () => {
      try {
        const settings = await getAppSettings();
        if (settings?.theme !== undefined) {
          await applyNormalizedTheme(settings.theme);
        }
      } catch (e) {
        console.error('Failed to load app settings', e);
      }
    };
    void loadAppSettings();

    let disposeThemeWatch: (() => void) | undefined;
    void (async () => {
      disposeThemeWatch = await onConfigChange('theme', (value) => {
        void applyNormalizedTheme(value);
      });
    })();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMedia = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener('change', handleMedia);

    return () => {
      disposeThemeWatch?.();
      media.removeEventListener('change', handleMedia);
    };
  }, []);

  const appendServerLog = useConsoleStore((state) => state.appendServerLog);
  const removeServerLogs = useConsoleStore((state) => state.removeServerLogs);
  const {
    clearAutoRestartTimer,
    resetAutoRestartState,
    markExpectedOffline,
    clearExpectedOffline,
    handleServerStatusChange,
  } = useServerAutomation({
    servers,
    setServers,
    showToast,
    t,
  });

  const loadTemplates = async () => {
    try {
      const templates = await getServerTemplates();
      setServerTemplates(templates);
    } catch (error) {
      console.error('Failed to load server templates:', error);
      setServerTemplates([]);
    }
  };

  const {
    handleContextMenu,
    handleDeleteServer,
    handleDuplicateServer,
    handleSaveServerTemplate,
    handleClickOutside,
  } = useServerContextActions({
    servers,
    setServers,
    selectedServerId,
    setSelectedServerId,
    contextMenu,
    setContextMenu,
    showToast,
    t,
    removeServerLogs,
    loadTemplates,
  });

  useServerRuntimeListeners({
    selectedServerId,
    setSelectedServerId,
    setServers,
    loadTemplates,
    appendServerLog,
    showToast,
    t,
    setDownloadStatus,
    setNgrokData,
    handleServerStatusChange,
  });

  const activeServer = servers.find((s) => s.id === selectedServerId);
  const { handleStart, handleStop, handleRestart } = useServerProcessActions({
    activeServer,
    selectedServerId,
    setServers,
    showToast,
    t,
    clearExpectedOffline,
    resetAutoRestartState,
    markExpectedOffline,
    clearAutoRestartTimer,
  });

  const handleUpdateServer = async (updatedServer: MinecraftServer) => {
    setServers((prev) => prev.map((s) => (s.id === updatedServer.id ? updatedServer : s)));
    await updateServerApi(updatedServer);
    showToast(t('server.toast.settingsSaved'), 'success');
  };

  const handleAddServer = async (serverData: unknown) => {
    try {
      const sd = serverData as Record<string, unknown>;
      const id = crypto.randomUUID();
      const serverPath = typeof sd.path === 'string' ? sd.path : '';
      if (!serverPath) {
        showToast(t('server.toast.pathEmpty'), 'error');
        return;
      }

      // サーバーディレクトリを作成
      await mkdir(serverPath, { recursive: true });

      const newServer: MinecraftServer = {
        id,
        name: (sd.name as string) || 'New Server',
        profileName: typeof sd.profileName === 'string' ? sd.profileName || undefined : undefined,
        groupName: typeof sd.groupName === 'string' ? sd.groupName || undefined : undefined,
        version: (sd.version as string) || '',
        software: (sd.software as string) || 'Vanilla',
        port: (sd.port as number) || 25565,
        memory: ((sd.memory as number) || 4) * 1024,
        path: serverPath,
        status: 'offline',
        javaPath: (sd.javaPath as string) || undefined,
        autoRestartOnCrash:
          typeof sd.autoRestartOnCrash === 'boolean' ? sd.autoRestartOnCrash : false,
        maxAutoRestarts: typeof sd.maxAutoRestarts === 'number' ? sd.maxAutoRestarts : 3,
        autoRestartDelaySec:
          typeof sd.autoRestartDelaySec === 'number' ? sd.autoRestartDelaySec : 5,
        autoBackupEnabled: typeof sd.autoBackupEnabled === 'boolean' ? sd.autoBackupEnabled : false,
        autoBackupIntervalMin:
          typeof sd.autoBackupIntervalMin === 'number' ? sd.autoBackupIntervalMin : 60,
        autoBackupScheduleType:
          sd.autoBackupScheduleType === 'daily' || sd.autoBackupScheduleType === 'weekly'
            ? sd.autoBackupScheduleType
            : 'interval',
        autoBackupTime: typeof sd.autoBackupTime === 'string' ? sd.autoBackupTime : '03:00',
        autoBackupWeekday:
          typeof sd.autoBackupWeekday === 'number' ? Math.floor(sd.autoBackupWeekday) : 0,
        createdDate: new Date().toISOString(),
      };
      await addServerApi(newServer);
      setServers((prev) => [...prev, newServer]);
      setSelectedServerId(newServer.id);
      setShowAddServerModal(false);
      showToast(t('server.toast.created'), 'success');

      // ダウンロードURL構築 & jarダウンロード
      const sw = (sd.software as string) || 'Vanilla';
      const ver = (sd.version as string) || '';
      let downloadUrl = '';

      try {
        if (sw === 'Paper' || sw === 'LeafMC') {
          const project = sw === 'Paper' ? 'paper' : 'leafmc';
          const buildsResp = await tauriFetch(
            `https://api.papermc.io/v2/projects/${project}/versions/${ver}/builds`,
          );
          const buildsData = (await buildsResp.json()) as PaperBuildsResponse;
          if (buildsData.builds && buildsData.builds.length > 0) {
            const latestBuild = buildsData.builds[buildsData.builds.length - 1];
            const buildNum = latestBuild.build;
            const fileName =
              latestBuild.downloads?.application?.name || `${project}-${ver}-${buildNum}.jar`;
            downloadUrl = `https://api.papermc.io/v2/projects/${project}/versions/${ver}/builds/${buildNum}/downloads/${fileName}`;
          }
        } else if (sw === 'Vanilla') {
          const manifestResp = await tauriFetch(
            'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
          );
          const manifest = (await manifestResp.json()) as MojangManifest;
          const verInfo = manifest.versions?.find((v) => v.id === ver);
          if (verInfo) {
            const verDetailResp = await tauriFetch(verInfo.url);
            const verDetail = (await verDetailResp.json()) as VerDetail;
            downloadUrl = verDetail.downloads?.server?.url || '';
          }
        } else if (sw === 'Fabric') {
          const loaderResp = await tauriFetch('https://meta.fabricmc.net/v2/versions/loader');
          const loaders = (await loaderResp.json()) as FabricLoader;
          const latestLoader = loaders?.[0]?.version || '';
          if (latestLoader) {
            downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${ver}/${latestLoader}/1.0.1/server/jar`;
          }
        }
      } catch (e) {
        console.error('Failed to resolve download URL:', e);
      }

      if (downloadUrl) {
        setDownloadStatus({
          id: newServer.id,
          progress: 0,
          msg: t('server.toast.downloadStarting'),
        });
        try {
          await downloadServerJar(downloadUrl, serverPath + '/server.jar', newServer.id);
        } catch (e) {
          console.error('Download failed:', e);
          setDownloadStatus(null);
          showToast(t('server.toast.jarDownloadFailed'), 'error');
        }
      } else {
        showToast(t('server.toast.jarUrlFailed'), 'info');
      }
    } catch (e) {
      console.error('Server creation error:', e);
      showToast(t('server.toast.createFailed'), 'error');
      setDownloadStatus(null);
    }
  };

  const handleBuildProxyNetwork = async (_config: ProxyNetworkConfig) => {
    const confirmed = await ask(t('proxy.confirmRewriteProperties'), {
      title: t('proxy.configTitle'),
      kind: 'info',
    });
    if (!confirmed) {
      return;
    }
    try {
      const backendServers = servers.filter((s) => _config.backendServerIds.includes(s.id));

      // 各バックエンドサーバーの server.properties と設定反映を並列実行
      await Promise.all(
        backendServers.map(async (srv, i) => {
          const propsPath = `${srv.path}/server.properties`;
          let props = '';
          try {
            props = await readFileContent(propsPath);
          } catch {
            props = '';
          }

          if (props.includes('online-mode=')) {
            props = props.replace(/online-mode=.*/g, 'online-mode=false');
          } else {
            props += '\nonline-mode=false';
          }

          const port = 25566 + i;
          if (props.includes('server-port=')) {
            props = props.replace(/server-port=.*/g, `server-port=${port}`);
          } else {
            props += `\nserver-port=${port}`;
          }

          await saveFileContent(propsPath, props);
          await updateServerApi({ ...srv, port });
        }),
      );

      showToast(
        t('proxy.settingsUpdated', {
          count: backendServers.length,
          software: _config.proxySoftware,
          port: _config.proxyPort,
        }),
        'success',
      );
      const loadedServers = await getServers();
      setServers(loadedServers);
    } catch (e) {
      console.error('Proxy build error:', e);
      showToast(t('proxy.configError'), 'error');
    }
  };

  const handleUpdateNow = async () => {
    setUpdateProgress(0);
    try {
      await downloadAndInstallUpdate((downloaded, total) => {
        const pct = total > 0 ? (downloaded / total) * 100 : 0;
        setUpdateProgress(pct);
      });
    } catch (e) {
      console.error('Update error', e);
      setUpdateProgress(null);
    }
  };

  const handleInstallUpdate = async () => {
    // downloadAndInstallUpdate already relaunches the app
    await handleUpdateNow();
  };

  const handleDismissUpdate = () => {
    setUpdatePrompt(null);
    setUpdateProgress(null);
    setUpdateReady(false);
  };

  const resolvedTheme = resolveAppTheme(appTheme, systemPrefersDark);
  const appShellStyle = buildAppShellStyle(resolvedTheme);

  const groupedServers = useMemo(() => {
    const grouped = new Map<string, MinecraftServer[]>();
    for (const server of servers) {
      const groupName = server.groupName?.trim() || t('server.list.ungrouped');
      const bucket = grouped.get(groupName) ?? [];
      bucket.push(server);
      grouped.set(groupName, bucket);
    }

    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([groupName, entries]) => ({
        groupName,
        servers: [...entries].sort((left, right) => left.name.localeCompare(right.name)),
      }));
  }, [servers, t]);

  const headerTitle = getHeaderTitle(currentView, activeServer?.name, t);

  const handleOpenSettingsWindow = () => {
    setCurrentView('app-settings');
  };

  const isBackupSelectorWindow = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('backupSelector') === '1';
  }, []);

  const renderContent = () => {
    type ViewRenderer = () => JSX.Element;

    const staticViewRenderers: Partial<Record<AppView, ViewRenderer>> = {
      'app-settings': () => <SettingsWindow onClose={() => setCurrentView('dashboard')} />,
      'proxy-help': () => <ProxyHelpView />,
      'ngrok-guide': () => <NgrokGuideView />,
      proxy: () => (
        <ProxySetupView
          servers={servers}
          onBuildNetwork={handleBuildProxyNetwork}
          onOpenHelp={() => setCurrentView('proxy-help')}
        />
      ),
    };

    const staticRenderer = staticViewRenderers[currentView];
    if (staticRenderer) {
      return staticRenderer();
    }

    if (!activeServer) {
      return (
        <div className="p-10 text-center text-zinc-500 text-xl">
          {t('server.list.selectOrCreate')}
        </div>
      );
    }

    const contentKey = `${activeServer.id}-${currentView}`;

    const serverViewRenderers: Partial<Record<AppView, ViewRenderer>> = {
      dashboard: () => <DashboardView key={contentKey} server={activeServer} />,
      console: () => (
        <ConsoleView
          key={contentKey}
          server={activeServer}
          ngrokUrl={ngrokData[activeServer.id] || null}
        />
      ),
      properties: () => <PropertiesView key={contentKey} server={activeServer} />,
      files: () => <FilesView key={contentKey} server={activeServer} />,
      plugins: () => <PluginBrowser key={contentKey} server={activeServer} />,
      backups: () => <BackupsView key={contentKey} server={activeServer} />,
      'general-settings': () => (
        <ServerSettings
          key={contentKey}
          server={activeServer}
          onSave={handleUpdateServer}
          onOpenNgrokGuide={() => setCurrentView('ngrok-guide')}
        />
      ),
      users: () => <UsersView key={contentKey} server={activeServer} />,
    };

    const serverRenderer = serverViewRenderers[currentView];
    if (serverRenderer) {
      return serverRenderer();
    }

    return <div>{t('errors.notFound')}</div>;
  };

  if (isBackupSelectorWindow) {
    return <BackupTargetSelectorWindow />;
  }

  return (
    <div
      className={`app-shell theme-${resolvedTheme}`}
      data-theme={resolvedTheme}
      onClick={handleClickOutside}
      style={appShellStyle}
    >
      <aside
        className={`app-sidebar app-shell__surface app-shell__surface--sidebar ${isSidebarOpen ? 'app-sidebar--open' : 'app-sidebar--collapsed'}`}
      >
        <div
          className={`app-sidebar__header ${isSidebarOpen ? 'app-sidebar__header--open' : 'app-sidebar__header--collapsed'}`}
        >
          {isSidebarOpen && (
            <button
              type="button"
              className="app-sidebar__brand"
              onClick={handleOpenSettingsWindow}
              aria-label={t('nav.openSettings')}
              title={t('nav.openSettings')}
            >
              MC-Vector
            </button>
          )}

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="app-sidebar__menu-button"
          >
            <img src={iconMenu} alt="" className="app-sidebar__menu-icon" />
          </button>
        </div>

        <div className="app-sidebar__nav app-shell__surface app-shell__surface--sidebar-panel surface-card">
          <AppNavItem
            label={isSidebarOpen ? t('nav.dashboard') : ''}
            tooltip={t('nav.dashboard')}
            view="dashboard"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconDashboard}
          />
          <AppNavItem
            label={isSidebarOpen ? t('nav.console') : ''}
            tooltip={t('nav.console')}
            view="console"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconConsole}
          />
          <AppNavItem
            label={isSidebarOpen ? t('nav.users') : ''}
            tooltip={t('nav.users')}
            view="users"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconUsers}
          />
          <AppNavItem
            label={isSidebarOpen ? t('nav.files') : ''}
            tooltip={t('nav.files')}
            view="files"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconFiles}
          />
          <AppNavItem
            label={isSidebarOpen ? t('nav.pluginsMods') : ''}
            tooltip={t('nav.pluginsMods')}
            view="plugins"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconPlugins}
          />
          <AppNavItem
            label={isSidebarOpen ? t('nav.backups') : ''}
            tooltip={t('nav.backups')}
            view="backups"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconBackups}
          />
          <AppNavItem
            label={isSidebarOpen ? t('nav.properties') : ''}
            tooltip={t('nav.properties')}
            view="properties"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconProperties}
          />
          <AppNavItem
            label={isSidebarOpen ? t('nav.generalSettings') : ''}
            tooltip={t('nav.generalSettings')}
            view="general-settings"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconSettings}
          />

          <hr className="app-sidebar__divider" />

          <AppNavItem
            label={isSidebarOpen ? t('nav.proxyNetwork') : ''}
            tooltip={t('nav.proxyNetwork')}
            view="proxy"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconProxy}
          />
        </div>

        <AppServerSidebar
          isSidebarOpen={isSidebarOpen}
          groupedServers={groupedServers}
          selectedServerId={selectedServerId}
          onSelectServer={setSelectedServerId}
          onServerContextMenu={handleContextMenu}
          onAddServer={() => setShowAddServerModal(true)}
          serversLabel={t('nav.servers').toUpperCase()}
          addServerLabel={t('nav.addServer')}
        />
      </aside>

      <main className="app-main app-shell__surface app-shell__surface--main">
        <header className="app-main__header app-shell__surface app-shell__surface--header">
          <div className="flex items-center gap-2.5">
            <h2 className="app-main__title">{headerTitle}</h2>
            <span className="app-main__subtitle"> / {getViewLabel(currentView, t)}</span>
          </div>
          <div className="flex items-center gap-2.5 ml-auto">
            {currentView !== 'proxy' && (
              <>
                <button
                  className="btn-start"
                  onClick={handleStart}
                  title={t('server.actions.start')}
                  disabled={
                    !activeServer ||
                    (activeServer.status !== 'offline' && activeServer.status !== 'crashed')
                  }
                >
                  ▶ {t('server.actions.start')}
                </button>
                <button
                  className="btn-restart btn-secondary"
                  onClick={handleRestart}
                  title={t('server.actions.restart')}
                  disabled={!activeServer || activeServer.status !== 'online'}
                >
                  ↻ {t('server.actions.restart')}
                </button>
                <button
                  className="btn-stop"
                  onClick={handleStop}
                  title={t('server.actions.stop')}
                  disabled={!activeServer || activeServer.status !== 'online'}
                >
                  ■ {t('server.actions.stop')}
                </button>
              </>
            )}
          </div>
        </header>
        <div className="app-main__content app-shell__surface app-shell__surface--content surface-card">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${selectedServerId || 'none'}-${currentView}`}
              initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
              transition={
                prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }
              }
              className="h-full"
            >
              <ViewErrorBoundary
                fallback={
                  <div className="flex h-full items-center justify-center text-sm text-red-400">
                    {t('errors.generic')}
                  </div>
                }
              >
                <Suspense fallback={lazyViewFallback}>{renderContent()}</Suspense>
              </ViewErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {downloadStatus && (
        <AppDownloadToast
          title={t('common.downloading')}
          progress={downloadStatus.progress}
          message={downloadStatus.msg}
        />
      )}
      {showAddServerModal && (
        <AddServerModal
          onClose={() => setShowAddServerModal(false)}
          onAdd={handleAddServer}
          templates={serverTemplates}
        />
      )}
      <AppContextMenu
        contextMenu={contextMenu}
        onDuplicateServer={handleDuplicateServer}
        onSaveServerTemplate={handleSaveServerTemplate}
        onDeleteServer={handleDeleteServer}
        cloneLabel={t('server.actions.clone')}
        saveTemplateLabel={t('server.actions.saveTemplate')}
        deleteLabel={t('common.delete')}
      />

      <AppUpdateModal
        updatePrompt={updatePrompt}
        updateProgress={updateProgress}
        updateReady={updateReady}
        t={t}
        onDismiss={handleDismissUpdate}
        onUpdateNow={handleUpdateNow}
        onInstall={handleInstallUpdate}
      />
    </div>
  );
}

export default App;
