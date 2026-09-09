import { useTranslation } from '@/i18n';
import { applyBackupRetention, createBackup } from '@/lib/backup-commands';
import { logError } from '@/lib/error-utils';
import { isEulaRequiredError } from '@/lib/eula-commands';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from '@/lib/global-shortcut-commands';
import {
  type ServerTemplate,
  getServerTemplates,
  startServer as startServerApi,
  stopServer as stopServerApi,
  updateServer as updateServerApi,
} from '@/lib/server-commands';
import AddServerChoiceModal from '@/renderer/components/AddServerChoiceModal';
import { useAppFeedback } from '@/renderer/components/AppFeedbackProvider';
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
import { useLiquidGlassSync } from '@/renderer/hooks/use-liquid-glass-sync';
import { useProxyNetworkAction } from '@/renderer/hooks/use-proxy-network-action';
import { useServerAutomation } from '@/renderer/hooks/use-server-automation';
import { useServerContextActions } from '@/renderer/hooks/use-server-context-actions';
import { useServerCreateAction } from '@/renderer/hooks/use-server-create-action';
import { runExclusiveServerStart, useServerEulaGate } from '@/renderer/hooks/use-server-eula-gate';
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function isBackupSelectorWindow(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('backupSelector') === '1';
}

function App() {
  if (isBackupSelectorWindow()) {
    return <BackupTargetSelectorWindow />;
  }

  return <MainApp />;
}

function MainApp() {
  const { t } = useTranslation();
  const { notify } = useAppFeedback();
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
  const showToast = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
      notify(msg, type);
    },
    [notify],
  );

  const isSidebarOpen = useUiStore((state) => state.isSidebarOpen);
  const setIsSidebarOpen = useUiStore((state) => state.setIsSidebarOpen);

  const [ngrokData, setNgrokData] = useState<Record<string, string | null>>({});
  const appTheme = useSettingsStore((state) => state.appTheme);
  const setAppTheme = useSettingsStore((state) => state.setAppTheme);
  const setLiquidGlassEnabled = useSettingsStore((state) => state.setLiquidGlassEnabled);
  const setAllowUnverifiedPluginDownloads = useSettingsStore(
    (state) => state.setAllowUnverifiedPluginDownloads,
  );
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
  useLiquidGlassSync({ setLiquidGlassEnabled, setAllowUnverifiedPluginDownloads });

  const appendServerLog = useConsoleStore((state) => state.appendServerLog);
  const removeServerLogs = useConsoleStore((state) => state.removeServerLogs);
  const { pendingEula, ensureServerEula, acceptPendingEula, cancelPendingEula } =
    useServerEulaGate();
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
    ensureServerEula,
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
    ensureServerEula,
  });
  serverActionsRef.current = { handleStart, handleStop, handleRestart, activeServer };

  const handleBulkStart = async (servers: MinecraftServer[]) => {
    for (const s of servers.filter((srv) => srv.status === 'offline')) {
      try {
        const gateResult = await runExclusiveServerStart(s.id, async () => {
          let result = await ensureServerEula(s, 'interactive');
          if (result === 'accepted') {
            const jarFile = s.software === 'Forge' ? 'forge-server.jar' : 'server.jar';
            setServers((prev) =>
              prev.map((srv) => (srv.id === s.id ? { ...srv, status: 'starting' } : srv)),
            );
            try {
              await startServerApi(s.id, s.javaPath || 'java', s.memory, jarFile, s.jvmArgs);
            } catch (error) {
              if (!isEulaRequiredError(error)) {
                throw error;
              }
              result = await ensureServerEula(s, 'interactive');
              if (result === 'accepted') {
                await startServerApi(s.id, s.javaPath || 'java', s.memory, jarFile, s.jvmArgs);
              }
            }
          }
          return result;
        });
        if (gateResult !== 'accepted') {
          setServers((prev) =>
            prev.map((srv) => (srv.id === s.id ? { ...srv, status: 'offline' } : srv)),
          );
        }
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
        await createBackup(s.id, buildAutoBackupName(s, new Date()));
        showToast(t('server.toast.bulkBackupCreated', { name: s.name }), 'success');

        try {
          const retention = await applyBackupRetention(
            s.id,
            s.autoBackupRetainCount ?? 0,
            s.autoBackupRetainDays ?? 0,
          );
          if (retention.failedDeleteCount > 0) {
            showToast(
              t('backups.toast.retentionDeleteFailed', {
                count: retention.failedDeleteCount,
              }),
              'warning',
            );
          }
          if (retention.listingFailed) {
            showToast(t('backups.toast.retentionListFailed'), 'warning');
          }
        } catch (error) {
          logError('Bulk backup retention failed', error, { serverId: s.id });
          showToast(t('backups.toast.retentionListFailed'), 'warning');
        }
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

  return (
    <div
      className={`app-shell flex h-screen w-screen theme-${resolvedTheme}`}
      data-theme={resolvedTheme}
      data-testid="app-root"
      style={appShellStyle}
    >
      <aside
        className={`app-sidebar z-20 flex shrink-0 flex-col border-r transition-all duration-200 app-shell__surface app-shell__surface--sidebar ${isSidebarOpen ? 'app-sidebar--open w-[260px]' : 'app-sidebar--collapsed w-[60px]'}`}
        data-testid="app-sidebar"
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

      <main
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden app-shell__surface app-shell__surface--main"
        data-testid="app-main"
      >
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
        pendingEula={pendingEula}
        onAcceptEula={acceptPendingEula}
        onCancelEula={cancelPendingEula}
        t={t}
      />
    </div>
  );
}

export default App;
