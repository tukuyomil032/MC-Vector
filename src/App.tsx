import { Drawer, DrawerContent } from '@/components/arc/drawer/drawer';
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
import { notify } from '@/renderer/shared/notify';
import { useAppThemeSync } from '@/renderer/hooks/use-app-theme-sync';
import { useAppUpdater } from '@/renderer/hooks/use-app-updater';
import { useGroupedServers } from '@/renderer/hooks/use-grouped-servers';
import { useLiquidGlassSync } from '@/renderer/hooks/use-liquid-glass-sync';
import { useMediaQuery } from '@/renderer/hooks/use-media-query';
import { useUpdateChannelSync } from '@/renderer/hooks/use-update-channel-sync';
import { useProxyNetworkAction } from '@/renderer/hooks/use-proxy-network-action';
import { useServerAutomation } from '@/renderer/hooks/use-server-automation';
import { useServerContextActions } from '@/renderer/hooks/use-server-context-actions';
import { useServerCreateAction } from '@/renderer/hooks/use-server-create-action';
import { runExclusiveServerStart, useServerEulaGate } from '@/renderer/hooks/use-server-eula-gate';
import { useServerProcessActions } from '@/renderer/hooks/use-server-process-actions';
import { useServerRuntimeListeners } from '@/renderer/hooks/use-server-runtime-listeners';
import { useServerMetricHistorySync } from '@/renderer/hooks/use-server-metric-history-sync';
import { useViewCycleShortcut } from '@/renderer/hooks/use-view-cycle-shortcut';
import { buildAppShellStyle, resolveAppTheme } from '@/renderer/shared/app-shell-theme';
import { buildAutoBackupName } from '@/renderer/shared/auto-backup';
import type { AppView, MinecraftServer } from '@/renderer/shared/server declaration';
import { canStartServer } from '@/renderer/shared/server-status';
import { getHeaderTitle } from '@/renderer/shared/view-labels';
import { useConsoleStore } from '@/store/consoleStore';
import { useServerStore } from '@/store/serverStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Below 1024px the sidebar is forced to the 60px icon rail; the user's expand choice is kept for wider windows. */
const RAIL_BELOW_QUERY = '(max-width: 1023px)';
/** Below 768px the sidebar leaves the layout and opens as a drawer from the header menu button. */
const DRAWER_BELOW_QUERY = '(max-width: 767px)';

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
  const { confirm } = useAppFeedback();
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

  const [serverTemplates, setServerTemplates] = useState<ServerTemplate[]>([]);
  const showToast = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
      notify[type](msg);
    },
    [],
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
  const setUpdateChannel = useSettingsStore((state) => state.setUpdateChannel);
  const {
    updatePrompt,
    updateProgress,
    updateError,
    updateCheckStatus,
    updateCheckError,
    updateReady,
    handleCheckForUpdates,
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
        } else if (canStartServer(srv.status)) {
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
  useEffect(() => {
    // Expose the theme on <html> so portaled overlays (Radix, toasts) inherit Arc tokens.
    document.documentElement.setAttribute('data-theme', resolveAppTheme(appTheme));
  }, [appTheme]);
  useLiquidGlassSync({ setLiquidGlassEnabled, setAllowUnverifiedPluginDownloads });
  useUpdateChannelSync({ setUpdateChannel });

  const appendServerLog = useConsoleStore((state) => state.appendServerLog);
  useServerMetricHistorySync({ servers });
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
    for (const s of servers.filter((srv) => canStartServer(srv.status))) {
      try {
        const gateResult = await runExclusiveServerStart(s.id, async () => {
          let result = await ensureServerEula(s, 'interactive');
          if (result === 'accepted') {
            setServers((prev) =>
              prev.map((srv) => (srv.id === s.id ? { ...srv, status: 'starting' } : srv)),
            );
            try {
              await startServerApi(s.id);
            } catch (error) {
              if (!isEulaRequiredError(error)) {
                throw error;
              }
              result = await ensureServerEula(s, 'interactive');
              if (result === 'accepted') {
                await startServerApi(s.id);
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
        const backupName = buildAutoBackupName(s, new Date());
        let outcome = await createBackup(s.id, backupName, undefined, false);
        if (outcome.status === 'confirmation_required') {
          const confirmed = await confirm({
            title: t('backups.stopForBackupTitle'),
            description: t('backups.confirmStopForBackup', { name: s.name }),
          });
          if (!confirmed) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          outcome = await createBackup(s.id, backupName, undefined, true);
        }
        if (outcome.status === 'confirmation_required') {
          showToast(t('backups.toast.serverStopFailed'), 'error');
        } else if (outcome.status === 'failed') {
          logError('Bulk backup operation failed', outcome.error, {
            serverId: s.id,
            serverPath: s.path,
            stage: outcome.stage,
            restartError: outcome.restartError,
          });
          if (outcome.restartError) {
            showToast(t('backups.toast.backupNotCreatedRestartFailed', { name: s.name }), 'error');
          } else {
            showToast(t('server.toast.bulkBackupFailed', { name: s.name }), 'error');
          }
        } else {
          showToast(t('server.toast.bulkBackupCreated', { name: s.name }), 'success');
          if (outcome.catalogError) {
            logError('Failed to update managed backup catalog', outcome.catalogError, {
              serverId: s.id,
              serverPath: s.path,
              backupName: outcome.backupName,
            });
            showToast(t('backups.toast.registryUpdateFailed'), 'warning');
          }
          if (outcome.restart.status === 'failed') {
            logError('Backup created but server restart failed', outcome.restart.error, {
              serverId: s.id,
              serverPath: s.path,
              backupName: outcome.backupName,
            });
            showToast(t('backups.toast.serverRestartFailed'), 'warning');
          }

          if (!outcome.catalogError) {
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
          }
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
    t,
  });
  const { handleBuildProxyNetwork } = useProxyNetworkAction({
    setServers,
    showToast,
    t,
  });

  const resolvedTheme = resolveAppTheme(appTheme);
  const appShellStyle = buildAppShellStyle(resolvedTheme);

  const groupedServers = useGroupedServers({ servers, t });

  const headerTitle = getHeaderTitle(currentView, activeServer?.name, t);

  const isRailForced = useMediaQuery(RAIL_BELOW_QUERY);
  const isDrawerLayout = useMediaQuery(DRAWER_BELOW_QUERY);
  const isSidebarExpanded = !isRailForced && isSidebarOpen;
  const [isSidebarDrawerOpen, setIsSidebarDrawerOpen] = useState(false);

  const handleOpenSettingsWindow = () => {
    setCurrentView('app-settings');
  };

  const serverPanelProps = {
    groupedServers,
    selectedServerId,
    onSelectServer: setSelectedServerId,
    onAddServer: () => setShowAddServerChoiceModal(true),
    onDuplicateServer: handleDuplicateServer,
    onSaveServerTemplate: handleSaveServerTemplate,
    onDeleteServer: handleDeleteServer,
    onBulkStart: handleBulkStart,
    onBulkStop: handleBulkStop,
    onBulkBackup: handleBulkBackup,
  };

  // In the drawer every choice also closes it, so the content underneath is visible again.
  const drawerNavigate = (view: AppView) => {
    setCurrentView(view);
    setIsSidebarDrawerOpen(false);
  };
  const drawerServerPanelProps = {
    ...serverPanelProps,
    onSelectServer: (serverId: string) => {
      setSelectedServerId(serverId);
      setIsSidebarDrawerOpen(false);
    },
  };

  return (
    <div
      className={`app-shell flex h-screen w-screen theme-${resolvedTheme}`}
      data-theme={resolvedTheme}
      data-testid="app-root"
      style={appShellStyle}
    >
      {!isDrawerLayout && (
        <aside
          className={`app-sidebar z-20 flex shrink-0 flex-col border-r transition-all duration-200 app-shell__surface app-shell__surface--sidebar ${isSidebarExpanded ? 'app-sidebar--open w-[260px]' : 'app-sidebar--collapsed w-[60px]'}`}
          data-testid="app-sidebar"
        >
          <AppSidebarHeader
            isSidebarOpen={isSidebarExpanded}
            onOpenSettings={handleOpenSettingsWindow}
            onToggleSidebar={isRailForced ? undefined : () => setIsSidebarOpen(!isSidebarOpen)}
            openSettingsLabel={t('nav.openSettings')}
            collapseLabel={t('nav.collapseSidebar')}
            expandLabel={t('nav.expandSidebar')}
          />

          <AppSidebarNavigation
            isSidebarOpen={isSidebarExpanded}
            currentView={currentView}
            setCurrentView={setCurrentView}
            t={t}
          />

          {isSidebarExpanded && <AppServerSidebar {...serverPanelProps} />}
        </aside>
      )}

      {isDrawerLayout && (
        <Drawer open={isSidebarDrawerOpen} onOpenChange={setIsSidebarDrawerOpen}>
          <DrawerContent title={t('nav.menuTitle')} side="left" closeLabel={t('common.close')}>
            <div
              className="app-sidebar app-sidebar--open flex h-full min-h-0 flex-col"
              data-testid="app-sidebar-drawer"
            >
              <AppSidebarHeader
                isSidebarOpen
                onOpenSettings={() => {
                  setIsSidebarDrawerOpen(false);
                  handleOpenSettingsWindow();
                }}
                openSettingsLabel={t('nav.openSettings')}
                collapseLabel={t('nav.collapseSidebar')}
                expandLabel={t('nav.expandSidebar')}
              />
              <AppSidebarNavigation
                isSidebarOpen
                currentView={currentView}
                setCurrentView={drawerNavigate}
                t={t}
              />
              <AppServerSidebar {...drawerServerPanelProps} />
            </div>
          </DrawerContent>
        </Drawer>
      )}

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
          onOpenMenu={isDrawerLayout ? () => setIsSidebarDrawerOpen(true) : undefined}
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
          onServerVersionChanged={(serverId, version) => {
            setServers((prev) =>
              prev.map((server) => (server.id === serverId ? { ...server, version } : server)),
            );
          }}
          onServerPortChanged={(serverId, port) => {
            setServers((prev) =>
              prev.map((server) => (server.id === serverId ? { ...server, port } : server)),
            );
          }}
          updaterSettings={{
            onCheckForUpdates: handleCheckForUpdates,
            updateCheckStatus,
            updateCheckError,
            updatePrompt,
            updateProgress,
          }}
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
