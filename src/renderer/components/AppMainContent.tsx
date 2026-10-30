import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { Button } from '@/components/arc/button/button';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { TriangleAlert } from 'lucide-react';
import { Suspense } from 'react';
import type { Translate } from '../../i18n';
import type { AppUpdaterSettings } from '../hooks/use-app-updater';
import type { AppView, MinecraftServer } from '../shared/server declaration';
import AppContentRouter from './AppContentRouter';
import ContentState from './ContentState';
import type { ProxyNetworkConfig } from './ProxySetupView';
import ViewErrorBoundary from './ViewErrorBoundary';
import styles from './AppMainContent.module.css';

interface AppMainContentProps {
  currentView: AppView;
  selectedServerId: string;
  setCurrentView: (view: AppView) => void;
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

export default function AppMainContent({
  currentView,
  selectedServerId,
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
}: AppMainContentProps) {
  const prefersReducedMotion = useReducedMotion();
  const lazyViewFallback = (
    <div className={styles.loading}>
      <Skeleton label={t('common.loadingView')} lines={4} />
    </div>
  );

  return (
    <div className={styles.card} data-testid="app-main-content">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${selectedServerId || 'none'}-${currentView}`}
          initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
          className={styles.viewFrame}
        >
          <ViewErrorBoundary
            fallback={(reset) => (
              <ContentState
                icon={<TriangleAlert size={20} strokeWidth={1.75} aria-hidden={true} />}
                title={t('errors.generic')}
                description={t('errors.viewFailedDescription')}
                action={
                  <Button type="button" variant="secondary" size="sm" onClick={reset}>
                    {t('common.reload')}
                  </Button>
                }
              />
            )}
          >
            <Suspense fallback={lazyViewFallback}>
              <AppContentRouter
                currentView={currentView}
                setCurrentView={setCurrentView}
                activeServer={activeServer}
                servers={servers}
                ngrokData={ngrokData}
                onBuildProxyNetwork={onBuildProxyNetwork}
                onUpdateServer={onUpdateServer}
                onServerVersionChanged={onServerVersionChanged}
                onServerPortChanged={onServerPortChanged}
                onAddServer={onAddServer}
                updaterSettings={updaterSettings}
                t={t}
              />
            </Suspense>
          </ViewErrorBoundary>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
