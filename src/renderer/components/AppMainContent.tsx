import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Suspense } from 'react';
import type { Translate } from '../../i18n';
import type { AppView, MinecraftServer } from '../shared/server declaration';
import AppContentRouter from './AppContentRouter';
import type { ProxyNetworkConfig } from './ProxySetupView';
import ViewErrorBoundary from './ViewErrorBoundary';

interface AppMainContentProps {
  currentView: AppView;
  selectedServerId: string;
  setCurrentView: (view: AppView) => void;
  activeServer: MinecraftServer | undefined;
  servers: MinecraftServer[];
  ngrokData: Record<string, string | null>;
  onBuildProxyNetwork: (config: ProxyNetworkConfig) => Promise<void>;
  onUpdateServer: (server: MinecraftServer) => Promise<void>;
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
  t,
}: AppMainContentProps) {
  const prefersReducedMotion = useReducedMotion();
  const lazyViewFallback = (
    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
      {t('common.loadingView')}
    </div>
  );

  return (
    <div
      className="app-main__content app-shell__surface app-shell__surface--content surface-card"
      data-testid="app-main-content"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${selectedServerId || 'none'}-${currentView}`}
          initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
          className="h-full"
        >
          <ViewErrorBoundary
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-red-400">
                {t('errors.generic')}
              </div>
            }
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
                t={t}
              />
            </Suspense>
          </ViewErrorBoundary>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
