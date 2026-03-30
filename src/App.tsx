import { useEffect, useRef, useState } from 'react';
import './index.scss';
import iconBackups from './assets/icons/backups.svg';
import iconConsole from './assets/icons/console.svg';
import iconDashboard from './assets/icons/dashboard.svg';
import iconFiles from './assets/icons/files.svg';
import iconMenu from './assets/icons/menu.svg';
import iconPlugins from './assets/icons/plugins.svg';
import iconProperties from './assets/icons/properties.svg';
import iconProxy from './assets/icons/proxy.svg';
import iconSettings from './assets/icons/settings.svg';
import iconUsers from './assets/icons/users.svg';
import { getAppSettings } from './lib/config-commands';
import { onNgrokStatusChange } from './lib/ngrok-commands';
// Tauri API ラッパー
import {
  addServer as addServerApi,
  deleteServer as deleteServerApi,
  downloadServerJar,
  getServers,
  onDownloadProgress,
  onServerLog,
  onServerStatusChange,
  startServer as startServerApi,
  stopServer as stopServerApi,
  updateServer as updateServerApi,
} from './lib/server-commands';
import { checkForUpdates, downloadAndInstallUpdate } from './lib/update-commands';
import AddServerModal from './renderer/components/AddServerModal';
import BackupsView from './renderer/components/BackupsView';
import ConsoleView from './renderer/components/ConsoleView';
import DashboardView from './renderer/components/DashboardView';
import FilesView from './renderer/components/FilesView';
import NgrokGuideView from './renderer/components/NgrokGuideView';
import PluginBrowser from './renderer/components/PluginBrowser';
import ProxyHelpView from './renderer/components/ProxyHelpView';
import ProxySetupView, { type ProxyNetworkConfig } from './renderer/components/ProxySetupView';
import PropertiesView from './renderer/components/properties/PropertiesView';
import ServerSettings from './renderer/components/properties/ServerSettings';
import SettingsWindow from './renderer/components/SettingsWindow';
import { useToast } from './renderer/components/ToastProvider';
import UsersView from './renderer/components/UsersView';
import { type AppView, type MinecraftServer } from './renderer/shared/server declaration';

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
  set: React.Dispatch<React.SetStateAction<AppView>>;
  iconSrc: string;
};
type AppTheme =
  | 'dark'
  | 'darkBlue'
  | 'grey'
  | 'forest'
  | 'sunset'
  | 'neon'
  | 'coffee'
  | 'ocean'
  | 'system';

function App() {
  const [servers, setServers] = useState<MinecraftServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    serverId: string;
  } | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{
    id: string;
    progress: number;
    msg: string;
  } | null>(null);
  const { showToast } = useToast();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [updatePrompt, setUpdatePrompt] = useState<{
    version?: string;
    releaseNotes?: unknown;
  } | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  const [ngrokData, setNgrokData] = useState<Record<string, string | null>>({});
  const [appTheme, setAppTheme] = useState<AppTheme>('system');
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

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
    (async () => {
      const { onConfigChange } = await import('./lib/config-commands');
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

  const [serverLogs, setServerLogs] = useState<Record<string, string[]>>({});
  const selectedServerIdRef = useRef(selectedServerId);

  useEffect(() => {
    selectedServerIdRef.current = selectedServerId;
  }, [selectedServerId]);

  useEffect(() => {
    const loadServers = async () => {
      try {
        const loadedServers = await getServers();
        setServers(loadedServers);
        if (loadedServers.length > 0 && !selectedServerId) {
          setSelectedServerId(loadedServers[0].id);
        }
      } catch {
        showToast('サーバーリスト読み込みエラー', 'error');
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
        setServerLogs((prev) => {
          const currentLogs = prev[data.serverId] || [];
          const newLogs = [...currentLogs, formattedLog];
          if (newLogs.length > 2000) {
            newLogs.shift();
          }
          return { ...prev, [data.serverId]: newLogs };
        });
      });
      unlisteners.push(u1);

      const u2 = await onDownloadProgress((data) => {
        if (cancelled) {
          return;
        }
        if (data.progress === 100) {
          setDownloadStatus(null);
          showToast(`ダウンロード完了: ${data.status}`, 'success');
        } else {
          setDownloadStatus({ id: data.serverId, progress: data.progress, msg: data.status });
        }
      });
      unlisteners.push(u2);

      const u3 = await onServerStatusChange((data) => {
        if (cancelled) {
          return;
        }
        setServers((prev) =>
          prev.map((s) =>
            s.id === data.serverId
              ? { ...s, status: data.status as unknown as MinecraftServer['status'] }
              : s
          )
        );
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

  const handleStart = async () => {
    if (!activeServer) {
      showToast('サーバーが選択されていません', 'error');
      return;
    }
    setServers((prev) =>
      prev.map((s) => (s.id === selectedServerId ? { ...s, status: 'starting' } : s))
    );
    const javaPath = activeServer.javaPath || 'java';
    const jarFile = activeServer.software === 'Forge' ? 'forge-server.jar' : 'server.jar';
    try {
      await startServerApi(
        activeServer.id,
        javaPath,
        activeServer.path,
        activeServer.memory,
        jarFile
      );
    } catch (e) {
      console.error('Start failed:', e);
      setServers((prev) =>
        prev.map((s) => (s.id === selectedServerId ? { ...s, status: 'offline' } : s))
      );
      showToast('サーバーの起動に失敗しました', 'error');
    }
  };
  const handleStop = async () => {
    if (selectedServerId) {
      await stopServerApi(selectedServerId);
    }
  };

  const handleRestart = async () => {
    if (!activeServer) {
      showToast('サーバーが選択されていません', 'error');
      return;
    }
    setServers((prev) =>
      prev.map((s) => (s.id === selectedServerId ? { ...s, status: 'restarting' } : s))
    );
    await stopServerApi(selectedServerId);
    // サーバーが完全に停止するまでポーリング
    const { isServerRunning } = await import('./lib/server-commands');
    const maxWait = 30; // 最大30秒待つ
    for (let i = 0; i < maxWait; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const running = await isServerRunning(selectedServerId);
      if (!running) {
        break;
      }
    }
    const javaPath = activeServer.javaPath || 'java';
    const jarFile = activeServer.software === 'Forge' ? 'forge-server.jar' : 'server.jar';
    await startServerApi(
      selectedServerId,
      javaPath,
      activeServer.path,
      activeServer.memory,
      jarFile
    );
  };

  const handleUpdateServer = async (updatedServer: MinecraftServer) => {
    setServers((prev) => prev.map((s) => (s.id === updatedServer.id ? updatedServer : s)));
    await updateServerApi(updatedServer);
    showToast('設定を保存しました', 'success');
  };

  const handleAddServer = async (serverData: unknown) => {
    try {
      const sd = serverData as Record<string, unknown>;
      const id = crypto.randomUUID();
      const serverPath = typeof sd.path === 'string' ? sd.path : '';
      if (!serverPath) {
        showToast('サーバーパスが空です', 'error');
        return;
      }

      // サーバーディレクトリを作成
      const { mkdir } = await import('@tauri-apps/plugin-fs');
      await mkdir(serverPath, { recursive: true });

      const newServer: MinecraftServer = {
        id,
        name: (sd.name as string) || 'New Server',
        version: (sd.version as string) || '',
        software: (sd.software as string) || 'Vanilla',
        port: (sd.port as number) || 25565,
        memory: ((sd.memory as number) || 4) * 1024,
        path: serverPath,
        status: 'offline',
        javaPath: (sd.javaPath as string) || undefined,
        createdDate: new Date().toISOString(),
      };
      await addServerApi(newServer);
      setServers((prev) => [...prev, newServer]);
      setSelectedServerId(newServer.id);
      setShowAddServerModal(false);
      showToast('サーバーを作成しました', 'success');

      // ダウンロードURL構築 & jarダウンロード
      const sw = (sd.software as string) || 'Vanilla';
      const ver = (sd.version as string) || '';
      let downloadUrl = '';

      try {
        if (sw === 'Paper' || sw === 'LeafMC') {
          const project = sw === 'Paper' ? 'paper' : 'leafmc';
          const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
          const buildsResp = await tauriFetch(
            `https://api.papermc.io/v2/projects/${project}/versions/${ver}/builds`
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
          const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
          const manifestResp = await tauriFetch(
            'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
          );
          const manifest = (await manifestResp.json()) as MojangManifest;
          const verInfo = manifest.versions?.find((v) => v.id === ver);
          if (verInfo) {
            const verDetailResp = await tauriFetch(verInfo.url);
            const verDetail = (await verDetailResp.json()) as VerDetail;
            downloadUrl = verDetail.downloads?.server?.url || '';
          }
        } else if (sw === 'Fabric') {
          const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
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
        setDownloadStatus({ id: newServer.id, progress: 0, msg: 'ダウンロード開始...' });
        try {
          await downloadServerJar(downloadUrl, serverPath + '/server.jar', newServer.id);
        } catch (e) {
          console.error('Download failed:', e);
          setDownloadStatus(null);
          showToast('JARのダウンロードに失敗しました', 'error');
        }
      } else {
        showToast('ダウンロードURLの取得に失敗しました。手動でJARを配置してください。', 'info');
      }
    } catch (e) {
      console.error('Server creation error:', e);
      showToast('サーバー作成に失敗しました', 'error');
      setDownloadStatus(null);
    }
  };

  const handleBuildProxyNetwork = async (_config: ProxyNetworkConfig) => {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    const confirmed = await ask(
      '構成を開始しますか？各サーバーの server.properties を書き換えます。',
      { title: 'プロキシ構成', kind: 'info' }
    );
    if (!confirmed) {
      return;
    }
    try {
      const { readFileContent, saveFileContent } = await import('./lib/file-commands');
      const backendServers = servers.filter((s) => _config.backendServerIds.includes(s.id));

      // 各バックエンドサーバーの server.properties を更新
      for (let i = 0; i < backendServers.length; i++) {
        const srv = backendServers[i];
        const propsPath = `${srv.path}/server.properties`;
        let props = '';
        try {
          props = await readFileContent(propsPath);
        } catch {
          props = '';
        }

        // online-mode=false に設定
        if (props.includes('online-mode=')) {
          props = props.replace(/online-mode=.*/g, 'online-mode=false');
        } else {
          props += '\nonline-mode=false';
        }

        // 各サーバーに一意のポートを割り当て (25566 + i)
        const port = 25566 + i;
        if (props.includes('server-port=')) {
          props = props.replace(/server-port=.*/g, `server-port=${port}`);
        } else {
          props += `\nserver-port=${port}`;
        }

        await saveFileContent(propsPath, props);

        // サーバーオブジェクトのポートも更新
        const updated = { ...srv, port };
        await updateServerApi(updated);
      }

      showToast(
        `${backendServers.length} 台のサーバーの設定を更新しました。プロキシサーバー (${_config.proxySoftware}) のポート ${_config.proxyPort} で接続してください。`,
        'success'
      );
      const loadedServers = await getServers();
      setServers(loadedServers);
    } catch (e) {
      console.error('Proxy build error:', e);
      showToast('プロキシ構成中にエラーが発生しました', 'error');
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
    const { ask } = await import('@tauri-apps/plugin-dialog');
    const confirmed = await ask(`本当に「${target?.name}」を削除しますか？`, {
      title: 'サーバー削除',
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
        setServerLogs((prev) => {
          const n = { ...prev };
          delete n[serverId];
          return n;
        });
        if (selectedServerId === serverId) {
          setSelectedServerId(newServers.length > 0 ? newServers[0].id : '');
        }
        showToast('サーバーを削除しました', 'success');
      } else {
        showToast('削除に失敗しました', 'error');
      }
    } catch (e) {
      console.error('Delete server error:', e);
      showToast('削除エラー', 'error');
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
    },
    grey: {
      mainBg: '#1b1d21',
      headerBg: 'rgba(36,38,44,0.92)',
      text: '#f3f4f6',
      sidebarBg: '#1f2227',
      sidebarPanelBg: '#252932',
      panelBg: '#21242b',
      border: '#2e323a',
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
    },
    sunset: {
      mainBg: 'linear-gradient(135deg, #1d1b2f 0%, #2b1d38 35%, #40202f 70%, #46271f 100%)',
      headerBg: 'rgba(46, 32, 54, 0.9)',
      text: '#ffe8d9',
      sidebarBg: '#261b32',
      sidebarPanelBg: '#2f203b',
      panelBg: '#2a1e32',
      border: '#4a2d3c',
    },
    neon: {
      mainBg: '#0a0a0f',
      headerBg: 'rgba(12,12,18,0.9)',
      text: '#e0f7ff',
      sidebarBg: '#0f1220',
      sidebarPanelBg: '#13172b',
      panelBg: '#0f1426',
      border: '#1f2b3f',
    },
    coffee: {
      mainBg: '#1a120f',
      headerBg: 'rgba(34,24,20,0.9)',
      text: '#f4e9dd',
      sidebarBg: '#221914',
      sidebarPanelBg: '#2a201b',
      panelBg: '#241c17',
      border: '#3a2c24',
    },
    ocean: {
      mainBg: 'radial-gradient(circle at 10% 20%, rgba(20,80,120,0.3), transparent 40%), #0c1720',
      headerBg: 'rgba(14,30,44,0.9)',
      text: '#e3f2ff',
      sidebarBg: '#0f1e2b',
      sidebarPanelBg: '#132538',
      panelBg: '#10212f',
      border: '#1f3a50',
    },
  };
  const themeColors =
    themePalette[resolvedTheme as Exclude<AppTheme, 'system'>] || themePalette.dark;

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
      return <ProxySetupView servers={servers} onBuildNetwork={handleBuildProxyNetwork} />;
    }
    if (!activeServer) {
      return (
        <div className="p-10 text-center text-zinc-500 text-xl">
          サーバーを選択するか、作成してください
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
          <ServerSettings key={contentKey} server={activeServer} onSave={handleUpdateServer} />
        );
      case 'users':
        return <UsersView key={contentKey} server={activeServer} />;
      default:
        return <div>Unknown View</div>;
    }
  };

  return (
    <div
      className="flex h-screen w-screen"
      onClick={handleClickOutside}
      style={{ background: themeColors.mainBg, color: themeColors.text }}
    >
      <aside
        className={`flex flex-col border-r shrink-0 z-20 transition-all duration-200 ${isSidebarOpen ? 'w-[260px]' : 'w-[60px]'}`}
        style={{
          background: themeColors.sidebarBg,
          borderColor: themeColors.border,
          color: themeColors.text,
        }}
      >
        <div
          className={`flex items-center ${isSidebarOpen ? 'justify-between' : 'justify-center'} p-5 bg-transparent`}
        >
          {isSidebarOpen && (
            <span
              className="font-bold text-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] cursor-pointer"
              onClick={handleOpenSettingsWindow}
              title="設定ウィンドウを開く"
              style={{ color: themeColors.text }}
            >
              MC-Vector
            </span>
          )}

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="bg-transparent border-none cursor-pointer p-1"
          >
            <img src={iconMenu} alt="Menu" className="w-5 h-5 opacity-80" />
          </button>
        </div>

        <div
          className="flex-1 p-2.5 flex flex-col overflow-y-auto rounded-xl"
          style={{ background: themeColors.sidebarPanelBg }}
        >
          <NavItem
            label={isSidebarOpen ? 'Dashboard' : ''}
            view="dashboard"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconDashboard}
          />
          <NavItem
            label={isSidebarOpen ? 'Console' : ''}
            view="console"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconConsole}
          />
          <NavItem
            label={isSidebarOpen ? 'Users' : ''}
            view="users"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconUsers}
          />
          <NavItem
            label={isSidebarOpen ? 'Files' : ''}
            view="files"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconFiles}
          />
          <NavItem
            label={isSidebarOpen ? 'Plugins / Mods' : ''}
            view="plugins"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconPlugins}
          />
          <NavItem
            label={isSidebarOpen ? 'Backups' : ''}
            view="backups"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconBackups}
          />
          <NavItem
            label={isSidebarOpen ? 'Properties' : ''}
            view="properties"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconProperties}
          />
          <NavItem
            label={isSidebarOpen ? 'General Settings' : ''}
            view="general-settings"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconSettings}
          />

          <hr className="w-[90%] border-white/10 my-2.5 mx-auto" />

          <NavItem
            label={isSidebarOpen ? 'Proxy Network' : ''}
            view="proxy"
            current={currentView}
            set={setCurrentView}
            iconSrc={iconProxy}
          />
        </div>

        {isSidebarOpen && (
          <div
            className="max-h-[40%] flex flex-col"
            style={{
              borderTop: `1px solid ${themeColors.border}`,
              background: themeColors.sidebarPanelBg,
            }}
          >
            <div className="px-2.5 py-1 text-xs text-text-secondary font-bold tracking-wider">
              SERVERS
            </div>
            <div className="overflow-y-auto flex-1 p-2.5 shrink-0">
              {servers.map((server) => (
                <div
                  key={server.id}
                  className={`px-3 py-2.5 mb-1.5 rounded-md flex items-center gap-3 transition-all cursor-pointer border border-transparent hover:bg-white/5 hover:translate-x-0.5 ${server.id === selectedServerId ? 'bg-accent/15 border-accent/30' : ''}`}
                  onClick={() => setSelectedServerId(server.id)}
                  onContextMenu={(e) => handleContextMenu(e, server.id)}
                >
                  <div className={`status-indicator ${server.status}`}></div>
                  <div className="flex flex-col">
                    <div className="font-semibold text-sm text-text-primary">{server.name}</div>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="mt-1.5 w-full py-2.5 bg-white/3 border border-dashed border-border-color text-text-secondary rounded-md transition-all text-sm hover:bg-white/8 hover:border-text-primary hover:text-text-primary hover:border-solid"
              onClick={() => setShowAddServerModal(true)}
            >
              + Add Server
            </button>
          </div>
        )}
      </aside>

      <main
        className="flex-1 flex flex-col overflow-hidden relative"
        style={{ background: themeColors.mainBg, color: themeColors.text }}
      >
        <header
          className="h-[60px] px-5 flex items-center justify-between border-b backdrop-blur-xl z-10 shrink-0"
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
                <button className="btn-start" onClick={handleStart} title="Start Server">
                  ▶ Start
                </button>
                <button
                  className="btn-restart btn-secondary"
                  onClick={handleRestart}
                  title="Restart Server"
                >
                  ↻ Restart
                </button>
                <button className="btn-stop" onClick={handleStop} title="Stop Server">
                  ■ Stop
                </button>
              </>
            )}
          </div>
        </header>
        <div
          className="flex-1 p-0 overflow-hidden relative flex flex-col"
          style={{ background: themeColors.panelBg }}
        >
          {renderContent()}
        </div>
      </main>

      {downloadStatus && (
        <div className="fixed bottom-5 right-5 bg-[#2c2c30] p-4 rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.5)] z-10000 text-white min-w-[280px] border border-border-color">
          <div className="font-bold mb-2 flex justify-between">
            <span>Downloading...</span>
            <span className="text-accent">{downloadStatus.progress}%</span>
          </div>
          <div className="text-sm mb-2 text-zinc-300">{downloadStatus.msg}</div>
          <div className="w-full h-1 bg-zinc-700 rounded-sm overflow-hidden">
            <div
              className="h-full bg-accent rounded-sm transition-all duration-200"
              style={{ width: `${downloadStatus.progress}%` }}
            ></div>
          </div>
        </div>
      )}
      {showAddServerModal && (
        <AddServerModal onClose={() => setShowAddServerModal(false)} onAdd={handleAddServer} />
      )}
      {contextMenu && (
        <div
          className="fixed bg-[#252526] border border-border-color rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.4)] z-9999 p-1 min-w-[140px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteServer();
            }}
            className="px-3 py-2 cursor-pointer text-red-400 text-sm rounded transition-colors flex items-center gap-2 hover:bg-red-500/10"
          >
            🗑️ 削除
          </div>
        </div>
      )}

      {updatePrompt && (
        <div className="fixed inset-0 bg-black/70 z-10000 flex items-center justify-center p-4">
          <div className="bg-[#252526] border border-zinc-700 rounded-lg shadow-2xl w-full max-w-[520px] p-6 text-white">
            <h3 className="text-xl font-semibold mt-0 mb-2">アップデートが利用可能です</h3>
            <p className="text-sm text-zinc-300 mb-4">
              バージョン: {updatePrompt.version || '不明'}
            </p>

            {getReleaseNotesText() && (
              <div className="mb-4">
                <div className="text-xs text-zinc-400 mb-1">リリースノート:</div>
                <pre className="bg-[#1b1b1b] border border-zinc-800 rounded p-3 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {getReleaseNotesText()}
                </pre>
              </div>
            )}

            {updateProgress !== null && !updateReady && (
              <div className="mb-4">
                <div className="text-sm text-zinc-300 mb-1">
                  ダウンロード中... {Math.round(updateProgress)}%
                </div>
                <div className="h-2 bg-zinc-800 rounded">
                  <div
                    className="h-2 bg-accent rounded"
                    style={{
                      width: `${Math.min(100, Math.round(updateProgress))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {updateReady && (
              <div className="mb-4 text-sm text-green-400">
                ダウンロードが完了しました。再起動して適用できます。
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={handleDismissUpdate}>
                後で
              </button>
              {!updateReady && (
                <button
                  className="btn-primary"
                  onClick={handleUpdateNow}
                  disabled={updateProgress !== null && !updateReady}
                >
                  今すぐアップデート
                </button>
              )}
              {updateReady && (
                <button className="btn-primary" onClick={handleInstallUpdate}>
                  再起動して適用
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
      className={`flex items-center ${isOpen ? 'justify-start px-4 py-2.5' : 'justify-center py-2.5 px-0'} cursor-pointer w-full box-border transition-all text-sm text-text-secondary rounded-md mx-1 my-0.5 border-l-[3px] ${isActive ? 'bg-accent/10 text-accent border-l-accent' : 'border-l-transparent hover:bg-bg-hover hover:text-text-primary hover:translate-x-1'}`}
      onClick={() => set(view)}
      title={isOpen ? '' : view}
    >
      <img
        src={iconSrc}
        alt={view}
        className={`w-5 h-5 shrink-0 block ${isOpen ? 'mr-3' : 'mr-0'} ${isActive ? 'invert' : 'opacity-70'}`}
      />
      {isOpen && <span className="whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>}
    </div>
  );
}

export default App;
