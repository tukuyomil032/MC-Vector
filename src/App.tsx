import { ask } from '@tauri-apps/plugin-dialog';
import { copyFile, mkdir, readDir } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { AnimatePresence, motion } from 'framer-motion';
import { type CSSProperties, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
import { createBackup } from './lib/backup-commands';
import { getAppSettings, onConfigChange } from './lib/config-commands';
import { readFileContent, saveFileContent } from './lib/file-commands';
import { onNgrokStatusChange } from './lib/ngrok-commands';
// Tauri API ラッパー
import {
  addServer as addServerApi,
  deleteServer as deleteServerApi,
  downloadServerJar,
  getServers,
  getServerTemplates,
  isServerRunning,
  onDownloadProgress,
  onServerLog,
  onServerStatusChange,
  type ServerTemplate,
  saveServerTemplate,
  startServer as startServerApi,
  stopServer as stopServerApi,
  updateServer as updateServerApi,
} from './lib/server-commands';
import { checkForUpdates, downloadAndInstallUpdate } from './lib/update-commands';
import AddServerModal from './renderer/components/AddServerModal';
import BackupsView from './renderer/components/BackupsView';
import BackupTargetSelectorWindow from './renderer/components/BackupTargetSelectorWindow';
import ConsoleView from './renderer/components/ConsoleView';
import NgrokGuideView from './renderer/components/NgrokGuideView';
import ProxyHelpView from './renderer/components/ProxyHelpView';
import ProxySetupView, { type ProxyNetworkConfig } from './renderer/components/ProxySetupView';
import PropertiesView from './renderer/components/properties/PropertiesView';
import ServerSettings from './renderer/components/properties/ServerSettings';
import { useToast } from './renderer/components/ToastProvider';
import UsersView from './renderer/components/UsersView';
import { type AppView, type MinecraftServer } from './renderer/shared/server declaration';
import { useConsoleStore } from './store/consoleStore';
import { useServerStore } from './store/serverStore';
import { type AppTheme, useSettingsStore } from './store/settingsStore';
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

type NavItemProps = {
  label: string;
  view: AppView;
  current: AppView;
  set: (view: AppView) => void;
  iconSrc: string;
};

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

  const [ngrokData, setNgrokData] = useState<Record<string, string | null>>({});
  const appTheme = useSettingsStore((state) => state.appTheme);
  const setAppTheme = useSettingsStore((state) => state.setAppTheme);
  const systemPrefersDark = useSettingsStore((state) => state.systemPrefersDark);
  const setSystemPrefersDark = useSettingsStore((state) => state.setSystemPrefersDark);

  const normalizeTheme = (value: unknown): AppTheme => {
    const allowed: AppTheme[] = [
      'dark',
      'darkBlue',
      'grey',
      'forest',
      'sunset',
      'neon',
      'coffee',
      'ocean',
      'system',
    ];
    return allowed.includes(value as AppTheme) ? (value as AppTheme) : 'dark';
  };

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
    const loadAppSettings = async () => {
      try {
        const settings = await getAppSettings();
        if (settings?.theme) {
          setAppTheme(normalizeTheme(settings.theme));
        }
      } catch (e) {
        console.error('Failed to load app settings', e);
      }
    };
    loadAppSettings();

    let disposeThemeWatch: (() => void) | undefined;
    void (async () => {
      disposeThemeWatch = await onConfigChange('theme', (value) => {
        setAppTheme(normalizeTheme(value));
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

  const serverLogs = useConsoleStore((state) => state.serverLogs);
  const appendServerLog = useConsoleStore((state) => state.appendServerLog);
  const removeServerLogs = useConsoleStore((state) => state.removeServerLogs);
  const selectedServerIdRef = useRef(selectedServerId);
  const serversRef = useRef<MinecraftServer[]>([]);
  const expectedOfflineEventsRef = useRef<Record<string, number>>({});
  const autoRestartAttemptsRef = useRef<Record<string, number>>({});
  const autoRestartTimerRef = useRef<Record<string, ReturnType<typeof window.setTimeout>>>({});
  const autoBackupIntervalRef = useRef<Record<string, ReturnType<typeof window.setInterval>>>({});
  const autoBackupRunningRef = useRef<Record<string, boolean>>({});
  const autoBackupLastRunKeyRef = useRef<Record<string, string>>({});

  const clearAutoRestartTimer = (serverId: string) => {
    const timerId = autoRestartTimerRef.current[serverId];
    if (timerId) {
      window.clearTimeout(timerId);
      delete autoRestartTimerRef.current[serverId];
    }
  };

  const resetAutoRestartState = (serverId: string) => {
    clearAutoRestartTimer(serverId);
    delete autoRestartAttemptsRef.current[serverId];
  };

  const markExpectedOffline = (serverId: string) => {
    expectedOfflineEventsRef.current[serverId] =
      (expectedOfflineEventsRef.current[serverId] ?? 0) + 1;
  };

  const consumeExpectedOffline = (serverId: string): boolean => {
    const current = expectedOfflineEventsRef.current[serverId] ?? 0;
    if (current <= 0) {
      return false;
    }
    if (current === 1) {
      delete expectedOfflineEventsRef.current[serverId];
    } else {
      expectedOfflineEventsRef.current[serverId] = current - 1;
    }
    return true;
  };

  const clearExpectedOffline = (serverId: string) => {
    delete expectedOfflineEventsRef.current[serverId];
  };

  const clearAutoBackupInterval = (serverId: string) => {
    const intervalId = autoBackupIntervalRef.current[serverId];
    if (intervalId) {
      window.clearInterval(intervalId);
      delete autoBackupIntervalRef.current[serverId];
    }
    delete autoBackupRunningRef.current[serverId];
    delete autoBackupLastRunKeyRef.current[serverId];
  };

  const resolveAutoBackupScheduleType = (
    server: MinecraftServer,
  ): 'interval' | 'daily' | 'weekly' => {
    return server.autoBackupScheduleType === 'daily' || server.autoBackupScheduleType === 'weekly'
      ? server.autoBackupScheduleType
      : 'interval';
  };

  const resolveAutoBackupTime = (server: MinecraftServer): string => {
    const raw = typeof server.autoBackupTime === 'string' ? server.autoBackupTime.trim() : '';
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(raw) ? raw : '03:00';
  };

  const resolveAutoBackupWeekday = (server: MinecraftServer): number => {
    const raw =
      typeof server.autoBackupWeekday === 'number' && Number.isFinite(server.autoBackupWeekday)
        ? Math.floor(server.autoBackupWeekday)
        : 0;
    return Math.min(6, Math.max(0, raw));
  };

  const buildTimeBasedAutoBackupKey = (server: MinecraftServer, now: Date): string | null => {
    const scheduleType = resolveAutoBackupScheduleType(server);
    if (scheduleType === 'interval') {
      return null;
    }

    const [hourText, minuteText] = resolveAutoBackupTime(server).split(':');
    const targetHour = Number(hourText);
    const targetMinute = Number(minuteText);

    if (now.getHours() !== targetHour || now.getMinutes() !== targetMinute) {
      return null;
    }

    if (scheduleType === 'weekly') {
      const targetWeekday = resolveAutoBackupWeekday(server);
      if (now.getDay() !== targetWeekday) {
        return null;
      }
    }

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${scheduleType}-${yyyy}-${mm}-${dd}-${hourText}-${minuteText}`;
  };

  const buildAutoBackupName = (server: MinecraftServer): string => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    return `AutoBackup ${server.name} ${yyyy}-${mm}-${dd}-${hh}-${min}-${sec}.zip`;
  };

  const runAutoBackup = async (serverId: string) => {
    if (autoBackupRunningRef.current[serverId]) {
      return;
    }

    const targetServer = serversRef.current.find((server) => server.id === serverId);
    if (!targetServer?.autoBackupEnabled || targetServer.status !== 'online') {
      return;
    }

    autoBackupRunningRef.current[serverId] = true;
    try {
      await createBackup(targetServer.path, buildAutoBackupName(targetServer));
      showToast(t('server.toast.autoBackupCreated', { name: targetServer.name }), 'success');
    } catch (error) {
      console.error('Auto backup failed:', error);
      showToast(t('server.toast.autoBackupFailed', { name: targetServer.name }), 'error');
    } finally {
      autoBackupRunningRef.current[serverId] = false;
    }
  };

  useEffect(() => {
    selectedServerIdRef.current = selectedServerId;
  }, [selectedServerId]);

  useEffect(() => {
    serversRef.current = servers;

    const activeServerIds = new Set(servers.map((server) => server.id));
    for (const serverId of Object.keys(autoRestartTimerRef.current)) {
      if (!activeServerIds.has(serverId)) {
        clearAutoRestartTimer(serverId);
      }
    }
    for (const serverId of Object.keys(autoRestartAttemptsRef.current)) {
      if (!activeServerIds.has(serverId)) {
        delete autoRestartAttemptsRef.current[serverId];
      }
    }
    for (const serverId of Object.keys(expectedOfflineEventsRef.current)) {
      if (!activeServerIds.has(serverId)) {
        delete expectedOfflineEventsRef.current[serverId];
      }
    }

    for (const serverId of Object.keys(autoBackupIntervalRef.current)) {
      if (!activeServerIds.has(serverId)) {
        clearAutoBackupInterval(serverId);
      }
    }

    for (const server of servers) {
      clearAutoBackupInterval(server.id);
      if (!server.autoBackupEnabled) {
        continue;
      }

      const scheduleType = resolveAutoBackupScheduleType(server);
      if (scheduleType === 'interval') {
        const intervalMinutes = Math.min(
          1440,
          Math.max(1, Math.floor(server.autoBackupIntervalMin ?? 60)),
        );

        autoBackupIntervalRef.current[server.id] = window.setInterval(
          () => {
            void runAutoBackup(server.id);
          },
          intervalMinutes * 60 * 1000,
        );
        continue;
      }

      autoBackupIntervalRef.current[server.id] = window.setInterval(() => {
        const latestServer = serversRef.current.find((candidate) => candidate.id === server.id);
        if (!latestServer?.autoBackupEnabled || latestServer.status !== 'online') {
          return;
        }

        const triggerKey = buildTimeBasedAutoBackupKey(latestServer, new Date());
        if (!triggerKey) {
          return;
        }

        if (autoBackupLastRunKeyRef.current[server.id] === triggerKey) {
          return;
        }

        autoBackupLastRunKeyRef.current[server.id] = triggerKey;
        void runAutoBackup(server.id);
      }, 15 * 1000);
    }
  }, [servers]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(autoRestartTimerRef.current)) {
        window.clearTimeout(timerId);
      }
      autoRestartTimerRef.current = {};

      for (const intervalId of Object.values(autoBackupIntervalRef.current)) {
        window.clearInterval(intervalId);
      }
      autoBackupIntervalRef.current = {};
      autoBackupRunningRef.current = {};
      autoBackupLastRunKeyRef.current = {};
    };
  }, []);

  const loadTemplates = async () => {
    try {
      const templates = await getServerTemplates();
      setServerTemplates(templates);
    } catch (error) {
      console.error('Failed to load server templates:', error);
      setServerTemplates([]);
    }
  };

  const buildTemplateFromServer = (
    server: MinecraftServer,
    templateName: string,
  ): ServerTemplate => {
    return {
      id: crypto.randomUUID(),
      name: templateName,
      profileName: server.profileName,
      groupName: server.groupName,
      version: server.version,
      software: server.software,
      port: server.port,
      memory: server.memory,
      javaPath: server.javaPath,
      autoRestartOnCrash: server.autoRestartOnCrash,
      maxAutoRestarts: server.maxAutoRestarts,
      autoRestartDelaySec: server.autoRestartDelaySec,
      autoBackupEnabled: server.autoBackupEnabled,
      autoBackupIntervalMin: server.autoBackupIntervalMin,
      autoBackupScheduleType: server.autoBackupScheduleType,
      autoBackupTime: server.autoBackupTime,
      autoBackupWeekday: server.autoBackupWeekday,
    };
  };

  const cloneServerDirectory = async (sourceDir: string, targetDir: string): Promise<void> => {
    await mkdir(targetDir, { recursive: true });

    const entries = await readDir(sourceDir);
    for (const entry of entries) {
      const entryName = entry.name;
      if (!entryName) {
        continue;
      }

      const sourcePath = `${sourceDir}/${entryName}`;
      const targetPath = `${targetDir}/${entryName}`;
      if (entry.isDirectory) {
        await cloneServerDirectory(sourcePath, targetPath);
      } else {
        await copyFile(sourcePath, targetPath);
      }
    }
  };

  useEffect(() => {
    const loadServers = async () => {
      try {
        const loadedServers = await getServers();
        setServers(loadedServers);
        await loadTemplates();
        if (loadedServers.length > 0 && !selectedServerId) {
          setSelectedServerId(loadedServers[0].id);
        }
      } catch {
        showToast(t('server.toast.loadError'), 'error');
      }
    };
    loadServers();

    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const setupListeners = async () => {
      const u1 = await onServerLog((data) => {
        if (cancelled) {
          return;
        }
        if (!data || !data.serverId) {
          return;
        }
        const formattedLog = data.line.replace(/\n/g, '\r\n');
        appendServerLog(data.serverId, formattedLog);
      });
      unlisteners.push(u1);

      const u2 = await onDownloadProgress((data) => {
        if (cancelled) {
          return;
        }
        if (data.progress === 100) {
          setDownloadStatus(null);
          showToast(t('server.toast.downloadComplete', { status: data.status }), 'success');
        } else {
          setDownloadStatus({ id: data.serverId, progress: data.progress, msg: data.status });
        }
      });
      unlisteners.push(u2);

      const u3 = await onServerStatusChange((data) => {
        if (cancelled) {
          return;
        }
        const status = data.status as MinecraftServer['status'];
        setServers((prev) => prev.map((s) => (s.id === data.serverId ? { ...s, status } : s)));

        if (status === 'online') {
          clearExpectedOffline(data.serverId);
          resetAutoRestartState(data.serverId);
          return;
        }

        if (status === 'offline' && consumeExpectedOffline(data.serverId)) {
          resetAutoRestartState(data.serverId);
          return;
        }

        if (status !== 'crashed' && status !== 'offline') {
          return;
        }

        const targetServer = serversRef.current.find((server) => server.id === data.serverId);
        if (!targetServer?.autoRestartOnCrash) {
          resetAutoRestartState(data.serverId);
          return;
        }

        const maxAutoRestarts = Math.min(
          20,
          Math.max(0, Math.floor(targetServer.maxAutoRestarts ?? 3)),
        );
        const restartDelaySec = Math.min(
          300,
          Math.max(1, Math.floor(targetServer.autoRestartDelaySec ?? 5)),
        );

        if (maxAutoRestarts <= 0) {
          return;
        }

        const currentAttempt = autoRestartAttemptsRef.current[data.serverId] ?? 0;
        if (currentAttempt >= maxAutoRestarts) {
          showToast(
            t('server.toast.autoRestartLimitReached', { name: targetServer.name }),
            'error',
          );
          return;
        }

        const nextAttempt = currentAttempt + 1;
        autoRestartAttemptsRef.current[data.serverId] = nextAttempt;

        clearAutoRestartTimer(data.serverId);
        setServers((prev) =>
          prev.map((server) =>
            server.id === data.serverId ? { ...server, status: 'restarting' } : server,
          ),
        );
        showToast(
          t('server.toast.autoRestartScheduled', {
            name: targetServer.name,
            seconds: restartDelaySec,
            attempt: nextAttempt,
            max: maxAutoRestarts,
          }),
          'info',
        );

        autoRestartTimerRef.current[data.serverId] = window.setTimeout(async () => {
          clearAutoRestartTimer(data.serverId);

          const latestServer = serversRef.current.find((server) => server.id === data.serverId);
          if (!latestServer?.autoRestartOnCrash) {
            resetAutoRestartState(data.serverId);
            return;
          }

          try {
            const running = await isServerRunning(data.serverId);
            if (running) {
              resetAutoRestartState(data.serverId);
              return;
            }

            setServers((prev) =>
              prev.map((server) =>
                server.id === data.serverId ? { ...server, status: 'starting' } : server,
              ),
            );

            const javaPath = latestServer.javaPath || 'java';
            const jarFile = latestServer.software === 'Forge' ? 'forge-server.jar' : 'server.jar';
            await startServerApi(
              latestServer.id,
              javaPath,
              latestServer.path,
              latestServer.memory,
              jarFile,
            );
          } catch (error) {
            console.error('Auto restart failed:', error);
            setServers((prev) =>
              prev.map((server) =>
                server.id === data.serverId ? { ...server, status: 'offline' } : server,
              ),
            );
            showToast(
              t('server.toast.autoRestartTriggered', {
                name: latestServer.name,
                attempt: nextAttempt,
                max: maxAutoRestarts,
              }),
              'error',
            );
          }
        }, restartDelaySec * 1000);
      });
      unlisteners.push(u3);

      const u4 = await onNgrokStatusChange((data) => {
        if (cancelled) {
          return;
        }
        if (data.status === 'stopped' || data.status === 'error') {
          setNgrokData((prev) => ({ ...prev, [data.serverId ?? '']: null }));
        } else if (data.url && data.serverId) {
          setNgrokData((prev) => ({ ...prev, [data.serverId!]: data.url! }));
        }
      });
      unlisteners.push(u4);

      // クリーンアップ済みなら即解除
      if (cancelled) {
        unlisteners.forEach((u) => u());
      }
    };

    setupListeners();

    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, []);

  useEffect(() => {
    // Ngrok status is now tracked via events; no poll needed
  }, [selectedServerId]);

  const activeServer = servers.find((s) => s.id === selectedServerId);

  const startServerProcess = async (server: MinecraftServer) => {
    const javaPath = server.javaPath || 'java';
    const jarFile = server.software === 'Forge' ? 'forge-server.jar' : 'server.jar';
    await startServerApi(server.id, javaPath, server.path, server.memory, jarFile);
  };

  const handleStart = async () => {
    if (!activeServer) {
      showToast(t('server.toast.noServerSelected'), 'error');
      return;
    }

    const serverId = activeServer.id;
    clearExpectedOffline(serverId);
    resetAutoRestartState(serverId);
    setServers((prev) => prev.map((s) => (s.id === serverId ? { ...s, status: 'starting' } : s)));

    try {
      await startServerProcess(activeServer);
    } catch (e) {
      console.error('Start failed:', e);
      setServers((prev) => prev.map((s) => (s.id === serverId ? { ...s, status: 'offline' } : s)));
      showToast(t('server.toast.startFailed'), 'error');
    }
  };

  const handleStop = async () => {
    if (selectedServerId) {
      markExpectedOffline(selectedServerId);
      clearAutoRestartTimer(selectedServerId);
      setServers((prev) =>
        prev.map((s) => (s.id === selectedServerId ? { ...s, status: 'stopping' } : s)),
      );

      try {
        await stopServerApi(selectedServerId);
      } catch (e) {
        console.error('Stop failed:', e);
        clearExpectedOffline(selectedServerId);
        resetAutoRestartState(selectedServerId);
        setServers((prev) =>
          prev.map((s) => (s.id === selectedServerId ? { ...s, status: 'offline' } : s)),
        );
        showToast(t('server.toast.stopFailed'), 'error');
      }
    }
  };

  const handleRestart = async () => {
    if (!activeServer) {
      showToast(t('server.toast.noServerSelected'), 'error');
      return;
    }

    const serverId = activeServer.id;
    markExpectedOffline(serverId);
    clearAutoRestartTimer(serverId);
    setServers((prev) => prev.map((s) => (s.id === serverId ? { ...s, status: 'restarting' } : s)));

    try {
      await stopServerApi(serverId);

      // サーバーが完全に停止するまでポーリング
      const maxWait = 30;
      for (let i = 0; i < maxWait; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const running = await isServerRunning(serverId);
        if (!running) {
          break;
        }
      }

      const running = await isServerRunning(serverId);
      if (running) {
        throw new Error('Timed out waiting for server shutdown');
      }

      await startServerProcess(activeServer);
    } catch (e) {
      console.error('Restart failed:', e);
      clearExpectedOffline(serverId);
      resetAutoRestartState(serverId);
      setServers((prev) => prev.map((s) => (s.id === serverId ? { ...s, status: 'offline' } : s)));
      showToast(t('server.toast.restartFailed'), 'error');
    }
  };

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

  const handleContextMenu = (e: React.MouseEvent, serverId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY, serverId });
  };

  const handleDeleteServer = async () => {
    if (!contextMenu) {
      return;
    }
    const { serverId } = contextMenu;
    const target = servers.find((s) => s.id === serverId);
    setContextMenu(null);

    // Tauri の ask() ダイアログで確認
    const confirmed = await ask(t('server.confirm.delete', { name: target?.name ?? '' }), {
      title: t('common.delete'),
      kind: 'warning',
    });
    if (!confirmed) {
      return;
    }

    try {
      const success = await deleteServerApi(serverId);
      if (success) {
        const newServers = servers.filter((s) => s.id !== serverId);
        setServers(newServers);
        removeServerLogs(serverId);
        if (selectedServerId === serverId) {
          setSelectedServerId(newServers.length > 0 ? newServers[0].id : '');
        }
        showToast(t('server.toast.deleted'), 'success');
      } else {
        showToast(t('server.toast.deleteFailed'), 'error');
      }
    } catch (e) {
      console.error('Delete server error:', e);
      showToast(t('server.toast.deleteError'), 'error');
    }
  };

  const handleDuplicateServer = async () => {
    if (!contextMenu) {
      return;
    }

    const { serverId } = contextMenu;
    const target = servers.find((server) => server.id === serverId);
    setContextMenu(null);
    if (!target) {
      return;
    }

    const confirmed = await ask(t('server.confirm.clone', { name: target.name }), {
      title: t('common.confirm'),
      kind: 'info',
    });
    if (!confirmed) {
      return;
    }

    try {
      const basePath = `${target.path}-clone`;
      const existingPaths = new Set(servers.map((server) => server.path));
      let candidatePath = basePath;
      let suffix = 1;
      while (existingPaths.has(candidatePath)) {
        candidatePath = `${basePath}-${suffix}`;
        suffix += 1;
      }

      await cloneServerDirectory(target.path, candidatePath);

      const duplicatedServer: MinecraftServer = {
        ...target,
        id: crypto.randomUUID(),
        name: t('server.create.cloneDefaultName', { name: target.name }),
        path: candidatePath,
        status: 'offline',
        createdDate: new Date().toISOString(),
      };

      await addServerApi(duplicatedServer);
      setServers((prev) => [...prev, duplicatedServer]);
      setSelectedServerId(duplicatedServer.id);
      showToast(t('server.toast.cloned'), 'success');
    } catch (error) {
      console.error('Duplicate server error:', error);
      showToast(t('server.toast.cloneFailed'), 'error');
    }
  };

  const handleSaveServerTemplate = async () => {
    if (!contextMenu) {
      return;
    }

    const { serverId } = contextMenu;
    const target = servers.find((server) => server.id === serverId);
    setContextMenu(null);
    if (!target) {
      return;
    }

    const templateName = window.prompt(
      t('server.create.templateNamePrompt'),
      t('server.create.templateDefaultName', { name: target.name }),
    );
    if (!templateName || !templateName.trim()) {
      return;
    }

    try {
      const template = buildTemplateFromServer(target, templateName.trim());
      await saveServerTemplate(template);
      await loadTemplates();
      showToast(t('server.toast.templateSaved'), 'success');
    } catch (error) {
      console.error('Save template error:', error);
      showToast(t('server.toast.templateSaveFailed'), 'error');
    }
  };

  const handleClickOutside = () => {
    if (contextMenu) {
      setContextMenu(null);
    }
  };

  const resolvedTheme: AppTheme =
    appTheme === 'system' ? (systemPrefersDark ? 'dark' : 'darkBlue') : appTheme;
  const themePalette: Record<
    Exclude<AppTheme, 'system'>,
    {
      mainBg: string;
      headerBg: string;
      text: string;
      sidebarBg: string;
      sidebarPanelBg: string;
      panelBg: string;
      border: string;
      viewGlowA: string;
      viewGlowB: string;
      panelStart: string;
      panelEnd: string;
      panelAltStart: string;
      panelAltEnd: string;
      borderSoft: string;
      borderStrong: string;
      accentStart: string;
      accentEnd: string;
      successStart: string;
      successEnd: string;
      warnStart: string;
      warnEnd: string;
    }
  > = {
    dark: {
      mainBg: '#0f0f11',
      headerBg: 'rgba(18,18,20,0.92)',
      text: '#ffffff',
      sidebarBg: '#16171d',
      sidebarPanelBg: '#1f2027',
      panelBg: '#1c1d23',
      border: '#2f2f3d',
      viewGlowA: 'rgba(74, 222, 128, 0.1)',
      viewGlowB: 'rgba(56, 189, 248, 0.15)',
      panelStart: 'rgba(24, 24, 27, 0.94)',
      panelEnd: 'rgba(17, 24, 39, 0.88)',
      panelAltStart: 'rgba(24, 24, 27, 0.95)',
      panelAltEnd: 'rgba(31, 41, 55, 0.84)',
      borderSoft: 'rgba(82, 82, 91, 0.72)',
      borderStrong: 'rgba(34, 211, 238, 0.42)',
      accentStart: '#0ea5e9',
      accentEnd: '#06b6d4',
      successStart: '#22c55e',
      successEnd: '#10b981',
      warnStart: '#f59e0b',
      warnEnd: '#f97316',
    },
    darkBlue: {
      mainBg:
        'radial-gradient(circle at 20% 20%, rgba(45,70,120,0.25), transparent 40%), radial-gradient(circle at 80% 10%, rgba(24,57,99,0.3), transparent 35%), #0b1628',
      headerBg: 'rgba(11,22,40,0.92)',
      text: '#e2e8f0',
      sidebarBg: '#0c1525',
      sidebarPanelBg: '#122036',
      panelBg: '#0f1d31',
      border: '#1f3657',
      viewGlowA: 'rgba(59, 130, 246, 0.2)',
      viewGlowB: 'rgba(14, 165, 233, 0.2)',
      panelStart: 'rgba(15, 23, 42, 0.94)',
      panelEnd: 'rgba(30, 58, 138, 0.55)',
      panelAltStart: 'rgba(15, 23, 42, 0.95)',
      panelAltEnd: 'rgba(30, 64, 175, 0.5)',
      borderSoft: 'rgba(37, 99, 235, 0.4)',
      borderStrong: 'rgba(56, 189, 248, 0.55)',
      accentStart: '#3b82f6',
      accentEnd: '#06b6d4',
      successStart: '#22c55e',
      successEnd: '#14b8a6',
      warnStart: '#f59e0b',
      warnEnd: '#f97316',
    },
    grey: {
      mainBg: '#1b1d21',
      headerBg: 'rgba(36,38,44,0.92)',
      text: '#f3f4f6',
      sidebarBg: '#1f2227',
      sidebarPanelBg: '#252932',
      panelBg: '#21242b',
      border: '#2e323a',
      viewGlowA: 'rgba(148, 163, 184, 0.12)',
      viewGlowB: 'rgba(99, 102, 241, 0.1)',
      panelStart: 'rgba(39, 39, 42, 0.94)',
      panelEnd: 'rgba(31, 41, 55, 0.88)',
      panelAltStart: 'rgba(39, 39, 42, 0.95)',
      panelAltEnd: 'rgba(51, 65, 85, 0.82)',
      borderSoft: 'rgba(113, 113, 122, 0.66)',
      borderStrong: 'rgba(148, 163, 184, 0.42)',
      accentStart: '#6366f1',
      accentEnd: '#8b5cf6',
      successStart: '#22c55e',
      successEnd: '#16a34a',
      warnStart: '#f59e0b',
      warnEnd: '#fb7185',
    },
    forest: {
      mainBg:
        'radial-gradient(circle at 20% 20%, rgba(46, 94, 72, 0.35), transparent 45%), #0f1914',
      headerBg: 'rgba(20, 40, 32, 0.9)',
      text: '#e9f5eb',
      sidebarBg: '#13201a',
      sidebarPanelBg: '#192b22',
      panelBg: '#16251d',
      border: '#214231',
      viewGlowA: 'rgba(34, 197, 94, 0.16)',
      viewGlowB: 'rgba(16, 185, 129, 0.15)',
      panelStart: 'rgba(20, 40, 32, 0.94)',
      panelEnd: 'rgba(22, 101, 52, 0.55)',
      panelAltStart: 'rgba(20, 40, 32, 0.95)',
      panelAltEnd: 'rgba(21, 128, 61, 0.5)',
      borderSoft: 'rgba(34, 197, 94, 0.38)',
      borderStrong: 'rgba(74, 222, 128, 0.55)',
      accentStart: '#22c55e',
      accentEnd: '#14b8a6',
      successStart: '#16a34a',
      successEnd: '#10b981',
      warnStart: '#f59e0b',
      warnEnd: '#fb7185',
    },
    sunset: {
      mainBg: 'linear-gradient(135deg, #1d1b2f 0%, #2b1d38 35%, #40202f 70%, #46271f 100%)',
      headerBg: 'rgba(46, 32, 54, 0.9)',
      text: '#ffe8d9',
      sidebarBg: '#261b32',
      sidebarPanelBg: '#2f203b',
      panelBg: '#2a1e32',
      border: '#4a2d3c',
      viewGlowA: 'rgba(251, 146, 60, 0.18)',
      viewGlowB: 'rgba(236, 72, 153, 0.16)',
      panelStart: 'rgba(55, 31, 48, 0.94)',
      panelEnd: 'rgba(120, 53, 15, 0.45)',
      panelAltStart: 'rgba(55, 31, 48, 0.95)',
      panelAltEnd: 'rgba(127, 29, 29, 0.45)',
      borderSoft: 'rgba(249, 115, 22, 0.42)',
      borderStrong: 'rgba(251, 146, 60, 0.55)',
      accentStart: '#f97316',
      accentEnd: '#ec4899',
      successStart: '#22c55e',
      successEnd: '#14b8a6',
      warnStart: '#f59e0b',
      warnEnd: '#f43f5e',
    },
    neon: {
      mainBg: '#0a0a0f',
      headerBg: 'rgba(12,12,18,0.9)',
      text: '#e0f7ff',
      sidebarBg: '#0f1220',
      sidebarPanelBg: '#13172b',
      panelBg: '#0f1426',
      border: '#1f2b3f',
      viewGlowA: 'rgba(6, 182, 212, 0.17)',
      viewGlowB: 'rgba(236, 72, 153, 0.13)',
      panelStart: 'rgba(13, 16, 32, 0.94)',
      panelEnd: 'rgba(17, 24, 39, 0.86)',
      panelAltStart: 'rgba(13, 16, 32, 0.95)',
      panelAltEnd: 'rgba(30, 41, 59, 0.82)',
      borderSoft: 'rgba(56, 189, 248, 0.32)',
      borderStrong: 'rgba(34, 211, 238, 0.58)',
      accentStart: '#06b6d4',
      accentEnd: '#a855f7',
      successStart: '#22c55e',
      successEnd: '#14b8a6',
      warnStart: '#f59e0b',
      warnEnd: '#fb7185',
    },
    coffee: {
      mainBg: '#1a120f',
      headerBg: 'rgba(34,24,20,0.9)',
      text: '#f4e9dd',
      sidebarBg: '#221914',
      sidebarPanelBg: '#2a201b',
      panelBg: '#241c17',
      border: '#3a2c24',
      viewGlowA: 'rgba(217, 119, 6, 0.16)',
      viewGlowB: 'rgba(120, 53, 15, 0.14)',
      panelStart: 'rgba(34, 24, 20, 0.94)',
      panelEnd: 'rgba(58, 44, 36, 0.84)',
      panelAltStart: 'rgba(34, 24, 20, 0.95)',
      panelAltEnd: 'rgba(68, 64, 60, 0.74)',
      borderSoft: 'rgba(146, 64, 14, 0.42)',
      borderStrong: 'rgba(245, 158, 11, 0.52)',
      accentStart: '#d97706',
      accentEnd: '#fb923c',
      successStart: '#22c55e',
      successEnd: '#16a34a',
      warnStart: '#f59e0b',
      warnEnd: '#fb7185',
    },
    ocean: {
      mainBg: 'radial-gradient(circle at 10% 20%, rgba(20,80,120,0.3), transparent 40%), #0c1720',
      headerBg: 'rgba(14,30,44,0.9)',
      text: '#e3f2ff',
      sidebarBg: '#0f1e2b',
      sidebarPanelBg: '#132538',
      panelBg: '#10212f',
      border: '#1f3a50',
      viewGlowA: 'rgba(14, 165, 233, 0.18)',
      viewGlowB: 'rgba(45, 212, 191, 0.16)',
      panelStart: 'rgba(15, 30, 43, 0.94)',
      panelEnd: 'rgba(16, 33, 47, 0.86)',
      panelAltStart: 'rgba(15, 30, 43, 0.95)',
      panelAltEnd: 'rgba(15, 45, 63, 0.82)',
      borderSoft: 'rgba(14, 116, 144, 0.42)',
      borderStrong: 'rgba(34, 211, 238, 0.55)',
      accentStart: '#0ea5e9',
      accentEnd: '#14b8a6',
      successStart: '#22c55e',
      successEnd: '#10b981',
      warnStart: '#f59e0b',
      warnEnd: '#f97316',
    },
  };
  const themeColors =
    themePalette[resolvedTheme as Exclude<AppTheme, 'system'>] || themePalette.dark;

  const appShellCssVars: Record<`--${string}`, string> = {
    '--mv-view-glow-a': themeColors.viewGlowA,
    '--mv-view-glow-b': themeColors.viewGlowB,
    '--mv-panel-start': themeColors.panelStart,
    '--mv-panel-end': themeColors.panelEnd,
    '--mv-panel-alt-start': themeColors.panelAltStart,
    '--mv-panel-alt-end': themeColors.panelAltEnd,
    '--mv-border-soft': themeColors.borderSoft,
    '--mv-border-strong': themeColors.borderStrong,
    '--mv-accent-start': themeColors.accentStart,
    '--mv-accent-end': themeColors.accentEnd,
    '--mv-success-start': themeColors.successStart,
    '--mv-success-end': themeColors.successEnd,
    '--mv-warn-start': themeColors.warnStart,
    '--mv-warn-end': themeColors.warnEnd,
  };

  const appShellStyle: CSSProperties = {
    background: themeColors.mainBg,
    color: themeColors.text,
    ...appShellCssVars,
  };

  const groupedServers = useMemo(() => {
    const grouped = new Map<string, MinecraftServer[]>();
    for (const server of servers) {
      const groupName = server.groupName?.trim() || 'Ungrouped';
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
  }, [servers]);

  const getReleaseNotesText = () => {
    const notes: unknown = updatePrompt?.releaseNotes;
    if (!notes) {
      return '';
    }
    if (typeof notes === 'string') {
      return notes;
    }
    if (Array.isArray(notes)) {
      return notes
        .map((entry: unknown) => {
          if (typeof entry === 'string') {
            return entry;
          }
          if (
            entry &&
            typeof entry === 'object' &&
            'body' in entry &&
            typeof (entry as Record<string, unknown>).body === 'string'
          ) {
            return (entry as Record<string, unknown>).body as string;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    return '';
  };

  const handleOpenSettingsWindow = () => {
    setCurrentView('app-settings');
  };

  const isBackupSelectorWindow = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('backupSelector') === '1';
  }, []);

  const renderContent = () => {
    if (currentView === 'app-settings') {
      return <SettingsWindow onClose={() => setCurrentView('dashboard')} />;
    }
    if (currentView === 'proxy-help') {
      return <ProxyHelpView />;
    }
    if (currentView === 'ngrok-guide') {
      return <NgrokGuideView />;
    }
    if (currentView === 'proxy') {
      return (
        <ProxySetupView
          servers={servers}
          onBuildNetwork={handleBuildProxyNetwork}
          onOpenHelp={() => setCurrentView('proxy-help')}
        />
      );
    }
    if (!activeServer) {
      return (
        <div className="p-10 text-center text-zinc-500 text-xl">
          {t('server.list.selectOrCreate')}
        </div>
      );
    }

    const contentKey = `${activeServer.id}-${currentView}`;

    switch (currentView) {
      case 'dashboard':
        return <DashboardView key={contentKey} server={activeServer} />;
      case 'console':
        return (
          <ConsoleView
            key={contentKey}
            server={activeServer}
            logs={serverLogs[activeServer.id] || []}
            ngrokUrl={ngrokData[activeServer.id] || null}
          />
        );
      case 'properties':
        return <PropertiesView key={contentKey} server={activeServer} />;
      case 'files':
        return <FilesView key={contentKey} server={activeServer} />;
      case 'plugins':
        return <PluginBrowser key={contentKey} server={activeServer} />;
      case 'backups':
        return <BackupsView key={contentKey} server={activeServer} />;
      case 'general-settings':
        return (
          <ServerSettings
            key={contentKey}
            server={activeServer}
            onSave={handleUpdateServer}
            onOpenNgrokGuide={() => setCurrentView('ngrok-guide')}
          />
        );
      case 'users':
        return <UsersView key={contentKey} server={activeServer} />;
      default:
        return <div>{t('errors.notFound')}</div>;
    }
  };

  if (isBackupSelectorWindow) {
    return <BackupTargetSelectorWindow />;
  }

  return (
    <div className="app-shell" onClick={handleClickOutside} style={appShellStyle}>
      <aside
        className={`app-sidebar ${isSidebarOpen ? 'app-sidebar--open' : 'app-sidebar--collapsed'}`}
        style={{
          background: themeColors.sidebarBg,
          borderColor: themeColors.border,
          color: themeColors.text,
        }}
      >
        <div
          className={`app-sidebar__header ${isSidebarOpen ? 'app-sidebar__header--open' : 'app-sidebar__header--collapsed'}`}
        >
          {isSidebarOpen && (
            <span
              className="font-bold text-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] cursor-pointer"
              onClick={handleOpenSettingsWindow}
              title={t('nav.openSettings')}
              style={{ color: themeColors.text }}
            >
              MC-Vector
            </span>
          )}

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="app-sidebar__menu-button"
          >
            <img src={iconMenu} alt="Menu" className="app-sidebar__menu-icon" />
          </button>
        </div>

        <div className="app-sidebar__nav" style={{ background: themeColors.sidebarPanelBg }}>
          <NavItem
            label={isSidebarOpen ? t('nav.dashboard') : ''}
            view="dashboard"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconDashboard}
          />
          <NavItem
            label={isSidebarOpen ? t('nav.console') : ''}
            view="console"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconConsole}
          />
          <NavItem
            label={isSidebarOpen ? t('nav.users') : ''}
            view="users"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconUsers}
          />
          <NavItem
            label={isSidebarOpen ? t('nav.files') : ''}
            view="files"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconFiles}
          />
          <NavItem
            label={isSidebarOpen ? t('nav.pluginsMods') : ''}
            view="plugins"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconPlugins}
          />
          <NavItem
            label={isSidebarOpen ? t('nav.backups') : ''}
            view="backups"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconBackups}
          />
          <NavItem
            label={isSidebarOpen ? t('nav.properties') : ''}
            view="properties"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconProperties}
          />
          <NavItem
            label={isSidebarOpen ? t('nav.generalSettings') : ''}
            view="general-settings"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconSettings}
          />

          <hr className="w-[90%] border-white/10 my-2.5 mx-auto" />

          <NavItem
            label={isSidebarOpen ? t('nav.proxyNetwork') : ''}
            view="proxy"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconProxy}
          />
        </div>

        {isSidebarOpen && (
          <div
            className="app-sidebar__servers"
            style={{
              borderTop: `1px solid ${themeColors.border}`,
              background: themeColors.sidebarPanelBg,
            }}
          >
            <div className="app-sidebar__servers-title">{t('nav.servers').toUpperCase()}</div>
            <div className="app-sidebar__server-list">
              {groupedServers.map((group) => (
                <div key={group.groupName} className="mb-2.5">
                  <div className="px-2 py-1 text-[0.68rem] uppercase tracking-[0.12em] text-zinc-400">
                    {group.groupName}
                  </div>

                  {group.servers.map((server) => (
                    <div
                      key={server.id}
                      className={`app-sidebar__server-item ${server.id === selectedServerId ? 'is-active' : ''}`}
                      onClick={() => setSelectedServerId(server.id)}
                      onContextMenu={(e) => handleContextMenu(e, server.id)}
                    >
                      <div className={`status-indicator ${server.status}`}></div>
                      <div className="flex flex-col">
                        <div className="font-semibold text-sm text-text-primary">{server.name}</div>
                        {server.profileName && (
                          <div className="text-[0.72rem] text-zinc-400">{server.profileName}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <button
              className="app-sidebar__add-server-btn"
              onClick={() => setShowAddServerModal(true)}
            >
              + {t('nav.addServer')}
            </button>
          </div>
        )}
      </aside>

      <main
        className="app-main"
        style={{ background: themeColors.mainBg, color: themeColors.text }}
      >
        <header
          className="app-main__header"
          style={{
            background: themeColors.headerBg,
            color: themeColors.text,
            borderColor: themeColors.border,
          }}
        >
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold" style={{ color: themeColors.text }}>
              {currentView === 'proxy' ? 'Network' : activeServer?.name}
            </h2>
            <span className="text-sm" style={{ color: themeColors.text, opacity: 0.7 }}>
              {' '}
              / {currentView}
            </span>
          </div>
          <div className="flex items-center gap-2.5 ml-auto">
            {currentView !== 'proxy' && (
              <>
                <button
                  className="btn-start"
                  onClick={handleStart}
                  title="Start Server"
                  disabled={
                    !activeServer ||
                    (activeServer.status !== 'offline' && activeServer.status !== 'crashed')
                  }
                >
                  ▶ Start
                </button>
                <button
                  className="btn-restart btn-secondary"
                  onClick={handleRestart}
                  title="Restart Server"
                  disabled={!activeServer || activeServer.status !== 'online'}
                >
                  ↻ Restart
                </button>
                <button
                  className="btn-stop"
                  onClick={handleStop}
                  title="Stop Server"
                  disabled={!activeServer || activeServer.status !== 'online'}
                >
                  ■ Stop
                </button>
              </>
            )}
          </div>
        </header>
        <div className="app-main__content" style={{ background: themeColors.panelBg }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${selectedServerId || 'none'}-${currentView}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="h-full"
            >
              <Suspense fallback={lazyViewFallback}>{renderContent()}</Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {downloadStatus && (
        <div className="download-toast">
          <div className="download-toast__header">
            <span>{t('common.downloading')}</span>
            <span className="text-accent">{downloadStatus.progress}%</span>
          </div>
          <div className="download-toast__message">{downloadStatus.msg}</div>
          <div className="download-toast__progress-track">
            <div
              className="download-toast__progress-bar"
              style={{ width: `${downloadStatus.progress}%` }}
            ></div>
          </div>
        </div>
      )}
      {showAddServerModal && (
        <AddServerModal
          onClose={() => setShowAddServerModal(false)}
          onAdd={handleAddServer}
          templates={serverTemplates}
        />
      )}
      {contextMenu && (
        <div className="app-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <div
            onClick={(event) => {
              event.stopPropagation();
              void handleDuplicateServer();
            }}
            className="app-context-menu__item"
          >
            📄 {t('server.actions.clone')}
          </div>

          <div
            onClick={(event) => {
              event.stopPropagation();
              void handleSaveServerTemplate();
            }}
            className="app-context-menu__item"
          >
            🧩 {t('server.actions.saveTemplate')}
          </div>

          <div
            onClick={(e) => {
              e.stopPropagation();
              void handleDeleteServer();
            }}
            className="app-context-menu__danger-item"
          >
            🗑️ {t('common.delete')}
          </div>
        </div>
      )}

      {updatePrompt && (
        <div className="app-update-overlay">
          <div className="app-update-modal">
            <h3 className="app-update-modal__title">
              {t('settings.update.available', { version: updatePrompt.version || '?' })}
            </h3>

            {getReleaseNotesText() && (
              <div className="mb-4">
                <div className="app-update-modal__notes-label">
                  {t('settings.update.releaseNotes')}
                </div>
                <pre className="app-update-modal__notes">{getReleaseNotesText()}</pre>
              </div>
            )}

            {updateProgress !== null && !updateReady && (
              <div className="mb-4">
                <div className="app-update-modal__progress-label">
                  {t('settings.update.downloading', { progress: Math.round(updateProgress) })}
                </div>
                <div className="app-update-modal__progress-track">
                  <div
                    className="app-update-modal__progress-bar"
                    style={{
                      width: `${Math.min(100, Math.round(updateProgress))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {updateReady && (
              <div className="mb-4 text-sm text-green-400">{t('settings.update.downloaded')}</div>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={handleDismissUpdate}>
                {t('common.cancel')}
              </button>
              {!updateReady && (
                <button
                  className="btn-primary"
                  onClick={handleUpdateNow}
                  disabled={updateProgress !== null && !updateReady}
                >
                  {t('settings.update.download')}
                </button>
              )}
              {updateReady && (
                <button className="btn-primary" onClick={handleInstallUpdate}>
                  {t('settings.update.restart')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ label, view, current, set, iconSrc }: NavItemProps) {
  const isOpen = !!label;
  const isActive = current === view;

  return (
    <div
      className={`app-nav-item ${isOpen ? 'app-nav-item--open' : 'app-nav-item--collapsed'} ${isActive ? 'is-active' : 'is-idle'}`}
      onClick={() => set(view)}
      title={isOpen ? '' : view}
    >
      <img
        src={iconSrc}
        alt={view}
        className={`app-nav-item__icon ${isOpen ? 'app-nav-item__icon--open' : 'app-nav-item__icon--collapsed'} ${isActive ? 'is-active' : 'is-idle'}`}
      />
      {isOpen && <span className="app-nav-item__label">{label}</span>}
    </div>
  );
}

export default App;
// test
// test lint error
