import { useTranslation } from '@/i18n';
import { createBackup } from '@/lib/backup-commands';
import { logError } from '@/lib/error-utils';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from '@/lib/global-shortcut-commands';
import {
  type ServerTemplate,
  getServerTemplates,
  startServer as startServerApi,
  stopServer as stopServerApi,
  updateServer as updateServerApi,
} from '@/lib/server-commands';
import AddServerChoiceModal from '@/renderer/components/AddServerChoiceModal';
import AppMainContent from '@/renderer/components/AppMainContent';
import AppMainHeader from '@/renderer/components/AppMainHeader';
import AppOverlayLayer from '@/renderer/components/AppOverlayLayer';
import AppServerSidebar from '@/renderer/components/AppServerSidebar';
import AppSidebarHeader from '@/renderer/components/AppSidebarHeader';
import AppSidebarNavigation from '@/renderer/components/AppSidebarNavigation';
import BackupTargetSelectorWindow from '@/renderer/components/BackupTargetSelectorWindow';
import { CommandPalette } from '@/renderer/components/CommandPalette';
import { useAppThemeSync } from '@/renderer/hooks/use-app-theme-sync';
import { useAppUpdater } from '@/renderer/hooks/use-app-updater';
import { useGroupedServers } from '@/renderer/hooks/use-grouped-servers';
import { useProxyNetworkAction } from '@/renderer/hooks/use-proxy-network-action';
import { useServerAutomation } from '@/renderer/hooks/use-server-automation';
import { useServerContextActions } from '@/renderer/hooks/use-server-context-actions';
import { useServerCreateAction } from '@/renderer/hooks/use-server-create-action';
import { useServerProcessActions } from '@/renderer/hooks/use-server-process-actions';
import { useServerRuntimeListeners } from '@/renderer/hooks/use-server-runtime-listeners';
import { useViewCycleShortcut } from '@/renderer/hooks/use-view-cycle-shortcut';
import { buildAppShellStyle, resolveAppTheme } from '@/renderer/shared/app-shell-theme';
import { buildAutoBackupName } from '@/renderer/shared/auto-backup';
import type { MinecraftServer } from '@/renderer/shared/server declaration';
import { getHeaderTitle } from '@/renderer/shared/view-labels';
import { useConsoleStore } from '@/store/consoleStore';
import { useServerStore } from '@/store/serverStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

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
  const [showImportServerModal, setShowImportServerModal] = useState(false);
  const [showAddServerChoiceModal, setShowAddServerChoiceModal] = useState(false);

  const [downloadStatus, setDownloadStatus] = useState<{
    id: string;
    progress: number;
    msg: string;
  } | null>(null);
  const [serverTemplates, setServerTemplates] = useState<ServerTemplate[]>([]);
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (type === 'success') {
      toast.success(msg);
    } else if (type === 'error') {
      toast.error(msg);
    } else {
      toast(msg);
    }
  };

  const isSidebarOpen = useUiStore((state) => state.isSidebarOpen);
  const setIsSidebarOpen = useUiStore((state) => state.setIsSidebarOpen);

  const [ngrokData, setNgrokData] = useState<Record<string, string | null>>({});
  const appTheme = useSettingsStore((state) => state.appTheme);
  const setAppTheme = useSettingsStore((state) => state.setAppTheme);
  const {
    updatePrompt,
    updateProgress,
    updateError,
    updateReady,
    handleUpdateNow,
    handleInstallUpdate,
    handleDismissUpdate,
  } = useAppUpdater();

  useViewCycleShortcut({ currentView, setCurrentView });

  const serverActionsRef = useRef<{
    handleStart: () => void;
    handleStop: () => void;
    handleRestart: () => void;
    activeServer: MinecraftServer | undefined;
  }>({
    handleStart: () => {},
    handleStop: () => {},
    handleRestart: () => {},
    activeServer: undefined,
  });

  useEffect(() => {
    void registerGlobalShortcuts({
      onStartStop: () => {
        const {
          activeServer: srv,
          handleStart: start,
          handleStop: stop,
        } = serverActionsRef.current;
        if (!srv) {
          return;
        }
        if (srv.status === 'online') {
          void stop();
        } else if (srv.status === 'offline') {
          void start();
        }
      },
      onRestart: () => {
        const { activeServer: srv, handleRestart: restart } = serverActionsRef.current;
        if (srv?.status === 'online') {
          void restart();
        }
      },
    });

    return () => {
      void unregisterGlobalShortcuts();
    };
  }, []);

  useAppThemeSync({ setAppTheme });

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
      logError('Failed to load server templates', error);
      setServerTemplates([]);
      showToast(t('server.toast.loadError'), 'error');
    }
  };

  const { handleDeleteServer, handleDuplicateServer, handleSaveServerTemplate } =
    useServerContextActions({
      servers,
      setServers,
      selectedServerId,
      setSelectedServerId,
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
  serverActionsRef.current = { handleStart, handleStop, handleRestart, activeServer };

  const handleBulkStart = async (servers: MinecraftServer[]) => {
    for (const s of servers.filter((srv) => srv.status === 'offline')) {
      try {
        setServers((prev) =>
          prev.map((srv) => (srv.id === s.id ? { ...srv, status: 'starting' } : srv)),
        );
        const jarFile = s.software === 'Forge' ? 'forge-server.jar' : 'server.jar';
        await startServerApi(s.id, s.javaPath || 'java', s.path, s.memory, jarFile, s.jvmArgs);
      } catch (error) {
        logError('Bulk start failed', error, { serverId: s.id });
        setServers((prev) =>
          prev.map((srv) => (srv.id === s.id ? { ...srv, status: 'offline' } : srv)),
        );
        showToast(t('server.toast.startFailed'), 'error');
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  };

  const handleBulkStop = async (serverIds: string[]) => {
    await Promise.allSettled(
      serverIds.map((id) =>
        stopServerApi(id).catch((error) => {
          logError('Bulk stop failed', error, { serverId: id });
        }),
      ),
    );
  };

  const handleBulkBackup = async (servers: MinecraftServer[]) => {
    for (const s of servers) {
      try {
        await createBackup(s.path, buildAutoBackupName(s, new Date()));
        showToast(t('server.toast.bulkBackupCreated', { name: s.name }), 'success');
      } catch (error) {
        logError('Bulk backup failed', error, { serverId: s.id });
        showToast(t('server.toast.bulkBackupFailed', { name: s.name }), 'error');
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  };

  const handleUpdateServer = async (updatedServer: MinecraftServer) => {
    try {
      await updateServerApi(updatedServer);
      setServers((prev) => prev.map((s) => (s.id === updatedServer.id ? updatedServer : s)));
      showToast(t('server.toast.settingsSaved'), 'success');
    } catch (error) {
      logError('Failed to update server settings', error, {
        serverId: updatedServer.id,
      });
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

  const resolvedTheme = resolveAppTheme(appTheme);
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
          onAddServer={() => setShowAddServerChoiceModal(true)}
          onDuplicateServer={handleDuplicateServer}
          onSaveServerTemplate={handleSaveServerTemplate}
          onDeleteServer={handleDeleteServer}
          serversLabel={t('nav.servers')}
          addServerLabel={t('nav.addServer')}
          bulkSelectLabel={t('nav.bulkSelect')}
          bulkStartLabel={t('nav.bulkStartSelected')}
          bulkStopLabel={t('nav.bulkStopSelected')}
          bulkBackupLabel={t('nav.bulkBackupSelected')}
          bulkClearLabel={t('nav.bulkClearSelection')}
          bulkSelectedCountLabel={(count) => t('nav.bulkSelectedCount', { count })}
          duplicateLabel={t('server.actions.clone')}
          saveTemplateLabel={t('server.actions.saveTemplate')}
          deleteLabel={t('common.delete')}
          onBulkStart={handleBulkStart}
          onBulkStop={handleBulkStop}
          onBulkBackup={handleBulkBackup}
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

      <AddServerChoiceModal
        open={showAddServerChoiceModal}
        onClose={() => setShowAddServerChoiceModal(false)}
        onNewServer={() => setShowAddServerModal(true)}
        onImportServer={() => setShowImportServerModal(true)}
      />

      <CommandPalette
        activeServer={activeServer}
        setCurrentView={setCurrentView}
        onStart={handleStart}
        onStop={handleStop}
        onRestart={handleRestart}
      />

      <AppOverlayLayer
        downloadStatus={downloadStatus}
        showAddServerModal={showAddServerModal}
        onCloseAddServerModal={() => setShowAddServerModal(false)}
        onAddServer={handleAddServer}
        serverTemplates={serverTemplates}
        showImportServerModal={showImportServerModal}
        onCloseImportServerModal={() => setShowImportServerModal(false)}
        updatePrompt={updatePrompt}
        updateProgress={updateProgress}
        updateError={updateError}
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
