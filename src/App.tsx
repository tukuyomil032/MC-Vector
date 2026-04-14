import { useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
// Tauri API ラッパー
import {
  getServerTemplates,
  type ServerTemplate,
  updateServer as updateServerApi,
} from '@/lib/server-commands';
import AppMainContent from '@/renderer/components/AppMainContent';
import AppMainHeader from '@/renderer/components/AppMainHeader';
import AppOverlayLayer from '@/renderer/components/AppOverlayLayer';
import AppSidebarHeader from '@/renderer/components/AppSidebarHeader';
import AppSidebarNavigation from '@/renderer/components/AppSidebarNavigation';
import AppServerSidebar from '@/renderer/components/AppServerSidebar';
import BackupTargetSelectorWindow from '@/renderer/components/BackupTargetSelectorWindow';
import { useToast } from '@/renderer/components/ToastProvider';
import { useAppUpdater } from '@/renderer/hooks/use-app-updater';
import { useAppThemeSync } from '@/renderer/hooks/use-app-theme-sync';
import { useGroupedServers } from '@/renderer/hooks/use-grouped-servers';
import { useServerContextActions } from '@/renderer/hooks/use-server-context-actions';
import { useServerAutomation } from '@/renderer/hooks/use-server-automation';
import { useProxyNetworkAction } from '@/renderer/hooks/use-proxy-network-action';
import { useServerCreateAction } from '@/renderer/hooks/use-server-create-action';
import { useServerProcessActions } from '@/renderer/hooks/use-server-process-actions';
import { useServerRuntimeListeners } from '@/renderer/hooks/use-server-runtime-listeners';
import { useViewCycleShortcut } from '@/renderer/hooks/use-view-cycle-shortcut';
import { buildAppShellStyle, resolveAppTheme } from '@/renderer/shared/app-shell-theme';
import { type MinecraftServer } from '@/renderer/shared/server declaration';
import { getHeaderTitle } from '@/renderer/shared/view-labels';
import { useConsoleStore } from '@/store/consoleStore';
import { useServerStore } from '@/store/serverStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';

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

  useViewCycleShortcut({ currentView, setCurrentView });

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
    try {
      await updateServerApi(updatedServer);
      setServers((prev) => prev.map((s) => (s.id === updatedServer.id ? updatedServer : s)));
      showToast(t('server.toast.settingsSaved'), 'success');
    } catch (error) {
      console.error('Update server failed:', error);
      showToast(t('server.toast.saveFailed'), 'error');
    }
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

  const groupedServers = useGroupedServers({ servers, t });

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
          serversLabel={t('nav.servers')}
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

      <AppOverlayLayer
        downloadStatus={downloadStatus}
        showAddServerModal={showAddServerModal}
        onCloseAddServerModal={() => setShowAddServerModal(false)}
        onAddServer={handleAddServer}
        serverTemplates={serverTemplates}
        contextMenu={contextMenu}
        onDuplicateServer={handleDuplicateServer}
        onSaveServerTemplate={handleSaveServerTemplate}
        onDeleteServer={handleDeleteServer}
        updatePrompt={updatePrompt}
        updateProgress={updateProgress}
        updateReady={updateReady}
        onDismissUpdate={handleDismissUpdate}
        onUpdateNow={handleUpdateNow}
        onInstallUpdate={handleInstallUpdate}
        t={t}
      />
    </div>
  );
}

export default App;
