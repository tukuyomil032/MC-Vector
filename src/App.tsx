import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from './i18n';
// Tauri API ラッパー
import {
  getServerTemplates,
  type ServerTemplate,
  updateServer as updateServerApi,
} from './lib/server-commands';
import AddServerModal from './renderer/components/AddServerModal';
import AppContextMenu from './renderer/components/AppContextMenu';
import AppDownloadToast from './renderer/components/AppDownloadToast';
import AppMainContent from './renderer/components/AppMainContent';
import AppMainHeader from './renderer/components/AppMainHeader';
import AppSidebarHeader from './renderer/components/AppSidebarHeader';
import AppSidebarNavigation from './renderer/components/AppSidebarNavigation';
import AppServerSidebar from './renderer/components/AppServerSidebar';
import AppUpdateModal from './renderer/components/AppUpdateModal';
import BackupTargetSelectorWindow from './renderer/components/BackupTargetSelectorWindow';
import { useToast } from './renderer/components/ToastProvider';
import { useAppUpdater } from './renderer/hooks/use-app-updater';
import { useAppThemeSync } from './renderer/hooks/use-app-theme-sync';
import { useServerContextActions } from './renderer/hooks/use-server-context-actions';
import { useServerAutomation } from './renderer/hooks/use-server-automation';
import { useProxyNetworkAction } from './renderer/hooks/use-proxy-network-action';
import { useServerCreateAction } from './renderer/hooks/use-server-create-action';
import { useServerProcessActions } from './renderer/hooks/use-server-process-actions';
import { useServerRuntimeListeners } from './renderer/hooks/use-server-runtime-listeners';
import { buildAppShellStyle, resolveAppTheme } from './renderer/shared/app-shell-theme';
import { type AppView, type MinecraftServer } from './renderer/shared/server declaration';
import { getHeaderTitle } from './renderer/shared/view-labels';
import { useConsoleStore } from './store/consoleStore';
import { useServerStore } from './store/serverStore';
import { useSettingsStore } from './store/settingsStore';
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

  const [ngrokData, setNgrokData] = useState<Record<string, string | null>>({});
  const appTheme = useSettingsStore((state) => state.appTheme);
  const setAppTheme = useSettingsStore((state) => state.setAppTheme);
  const systemPrefersDark = useSettingsStore((state) => state.systemPrefersDark);
  const setSystemPrefersDark = useSettingsStore((state) => state.setSystemPrefersDark);
  const {
    updatePrompt,
    updateProgress,
    updateReady,
    handleUpdateNow,
    handleInstallUpdate,
    handleDismissUpdate,
  } = useAppUpdater();

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

  useAppThemeSync({ setAppTheme, setSystemPrefersDark });

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
  const { handleAddServer } = useServerCreateAction({
    setServers,
    setSelectedServerId,
    setShowAddServerModal,
    setDownloadStatus,
    showToast,
    t,
  });
  const { handleBuildProxyNetwork } = useProxyNetworkAction({
    servers,
    setServers,
    showToast,
    t,
  });

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
        <AppSidebarHeader
          isSidebarOpen={isSidebarOpen}
          onOpenSettings={handleOpenSettingsWindow}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          openSettingsLabel={t('nav.openSettings')}
        />

        <AppSidebarNavigation
          isSidebarOpen={isSidebarOpen}
          currentView={currentView}
          setCurrentView={setCurrentView}
          t={t}
        />

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
        <AppMainHeader
          currentView={currentView}
          headerTitle={headerTitle}
          activeServerStatus={activeServer?.status}
          onStart={handleStart}
          onRestart={handleRestart}
          onStop={handleStop}
          t={t}
        />
        <AppMainContent
          currentView={currentView}
          selectedServerId={selectedServerId}
          setCurrentView={setCurrentView}
          activeServer={activeServer}
          servers={servers}
          ngrokData={ngrokData}
          onBuildProxyNetwork={handleBuildProxyNetwork}
          onUpdateServer={handleUpdateServer}
          t={t}
        />
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
