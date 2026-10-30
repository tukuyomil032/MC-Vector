import { Plus, SearchX, Server } from 'lucide-react';
import { type JSX, lazy } from 'react';
import { Button } from '@/components/arc/button/button';
import type { Translate } from '../../i18n';
import type { AppUpdaterSettings } from '../hooks/use-app-updater';
import { useUiStore } from '../../store/uiStore';
import type { AppView, MinecraftServer } from '../shared/server declaration';
import BackupsView from './BackupsView';
import ConsoleView from './ConsoleView';
import ContentState from './ContentState';
import NgrokGuideView from './NgrokGuideView';
import ProxyHelpView from './ProxyHelpView';
import ProxySetupView, { type ProxyNetworkConfig } from './ProxySetupView';
import UsersView from './UsersView';
import PropertiesView from './properties/PropertiesView';
import ServerSettings from './properties/ServerSettings';

const DashboardView = lazy(() => import('./DashboardView'));
const FilesView = lazy(() => import('./FilesView'));
const PluginBrowser = lazy(() => import('./PluginBrowser'));
const SettingsWindow = lazy(() => import('./SettingsWindow'));
// Dev-only: the conditional keeps the UI Lab chunk out of production builds.
const UiLabView = import.meta.env.DEV ? lazy(() => import('./UiLabView')) : null;

type SetCurrentView = (view: AppView) => void;

interface AppContentRouterProps {
  currentView: AppView;
  setCurrentView: SetCurrentView;
  activeServer: MinecraftServer | undefined;
  servers: MinecraftServer[];
  ngrokData: Record<string, string | null>;
  onBuildProxyNetwork: (config: ProxyNetworkConfig) => Promise<void>;
  onUpdateServer: (server: MinecraftServer) => Promise<void>;
  onServerVersionChanged: (serverId: string, version: string) => void;
  onServerPortChanged: (serverId: string, port: number) => void;
  onAddServer: () => void;
  updaterSettings: AppUpdaterSettings;
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
  onServerVersionChanged,
  onServerPortChanged,
  onAddServer,
  updaterSettings,
  t,
}: AppContentRouterProps) {
  type ViewRenderer = () => JSX.Element;
  const returnToPreviousView = useUiStore((state) => state.returnToPreviousView);

  const staticViewRenderers: Partial<Record<AppView, ViewRenderer>> = {
    'app-settings': () => <SettingsWindow onClose={returnToPreviousView} {...updaterSettings} />,
    'proxy-help': () => <ProxyHelpView />,
    'ngrok-guide': () => <NgrokGuideView />,
    proxy: () => (
      <ProxySetupView
        servers={servers}
        onBuildNetwork={onBuildProxyNetwork}
        onOpenHelp={() => setCurrentView('proxy-help')}
      />
    ),
    ...(UiLabView ? { 'ui-lab': () => <UiLabView /> } : {}),
  };

  const staticRenderer = staticViewRenderers[currentView];
  if (staticRenderer) {
    return staticRenderer();
  }

  if (!activeServer) {
    const hasServers = servers.length > 0;
    return (
      <ContentState
        icon={<Server size={20} strokeWidth={1.75} aria-hidden={true} />}
        title={hasServers ? t('server.title') : t('server.list.emptyTitle')}
        description={hasServers ? t('server.list.selectOrCreate') : t('server.list.empty')}
        action={
          <Button type="button" variant="primary" size="sm" onClick={onAddServer}>
            <Plus size={14} strokeWidth={1.75} aria-hidden={true} />
            {t('nav.addServer')}
          </Button>
        }
      />
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
    properties: () => (
      <PropertiesView
        key={contentKey}
        server={activeServer}
        onServerPortChanged={onServerPortChanged}
      />
    ),
    files: () => <FilesView key={contentKey} server={activeServer} />,
    plugins: () => <PluginBrowser key={contentKey} server={activeServer} />,
    backups: () => <BackupsView key={contentKey} server={activeServer} />,
    'general-settings': () => (
      <ServerSettings
        key={contentKey}
        server={activeServer}
        onSave={onUpdateServer}
        onServerVersionChanged={onServerVersionChanged}
        onOpenNgrokGuide={() => setCurrentView('ngrok-guide')}
      />
    ),
    users: () => <UsersView key={contentKey} server={activeServer} />,
  };

  const serverRenderer = serverViewRenderers[currentView];
  if (serverRenderer) {
    return serverRenderer();
  }

  return (
    <ContentState
      icon={<SearchX size={20} strokeWidth={1.75} aria-hidden={true} />}
      title={t('errors.notFound')}
      description={t('errors.notFoundDescription')}
    />
  );
}
