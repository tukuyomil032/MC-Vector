import { type JSX, lazy } from 'react';
import type { AppView, MinecraftServer } from '../shared/server declaration';
import BackupsView from './BackupsView';
import ConsoleView from './ConsoleView';
import NgrokGuideView from './NgrokGuideView';
import ProxyHelpView from './ProxyHelpView';
import ProxySetupView, { type ProxyNetworkConfig } from './ProxySetupView';
import PropertiesView from './properties/PropertiesView';
import ServerSettings from './properties/ServerSettings';
import UsersView from './UsersView';

const DashboardView = lazy(() => import('./DashboardView'));
const FilesView = lazy(() => import('./FilesView'));
const PluginBrowser = lazy(() => import('./PluginBrowser'));
const SettingsWindow = lazy(() => import('./SettingsWindow'));

type Translate = (key: string, values?: Record<string, unknown>) => string;
type SetCurrentView = (view: AppView) => void;

interface AppContentRouterProps {
  currentView: AppView;
  setCurrentView: SetCurrentView;
  activeServer: MinecraftServer | undefined;
  servers: MinecraftServer[];
  ngrokData: Record<string, string | null>;
  onBuildProxyNetwork: (config: ProxyNetworkConfig) => Promise<void>;
  onUpdateServer: (server: MinecraftServer) => Promise<void>;
  t: Translate;
}

export default function AppContentRouter({
  currentView,
  setCurrentView,
  activeServer,
  servers,
  ngrokData,
  onBuildProxyNetwork,
  onUpdateServer,
  t,
}: AppContentRouterProps) {
  type ViewRenderer = () => JSX.Element;

  const staticViewRenderers: Partial<Record<AppView, ViewRenderer>> = {
    'app-settings': () => <SettingsWindow onClose={() => setCurrentView('dashboard')} />,
    'proxy-help': () => <ProxyHelpView />,
    'ngrok-guide': () => <NgrokGuideView />,
    proxy: () => (
      <ProxySetupView
        servers={servers}
        onBuildNetwork={onBuildProxyNetwork}
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
        onSave={onUpdateServer}
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
}
