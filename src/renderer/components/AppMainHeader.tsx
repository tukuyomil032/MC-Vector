import type { Translate } from '../../i18n';
import type { AppView, MinecraftServer } from '../shared/server declaration';
import { getViewLabel } from '../shared/view-labels';

interface AppMainHeaderProps {
  currentView: AppView;
  headerTitle: string;
  activeServerStatus: MinecraftServer['status'] | undefined;
  onStart: () => void;
  onRestart: () => void;
  onStop: () => void;
  t: Translate;
}

export default function AppMainHeader({
  currentView,
  headerTitle,
  activeServerStatus,
  onStart,
  onRestart,
  onStop,
  t,
}: AppMainHeaderProps) {
  const canStart = activeServerStatus === 'offline' || activeServerStatus === 'crashed';
  const isOnline = activeServerStatus === 'online';

  return (
    <header
      className="app-main__header app-shell__surface app-shell__surface--header"
      data-testid="app-main-header"
    >
      <div className="flex items-center gap-2.5">
        <h2 className="app-main__title">{headerTitle}</h2>
        <span className="app-main__subtitle"> / {getViewLabel(currentView, t)}</span>
      </div>
      <div className="flex items-center gap-2.5 ml-auto">
        {currentView !== 'proxy' && (
          <>
            <button
              className="btn-start"
              data-testid="server-start-button"
              onClick={onStart}
              title={t('server.actions.start')}
              disabled={!canStart}
            >
              ▶ {t('server.actions.start')}
            </button>
            <button
              className="btn-restart btn-secondary"
              data-testid="server-restart-button"
              onClick={onRestart}
              title={t('server.actions.restart')}
              disabled={!isOnline}
            >
              ↻ {t('server.actions.restart')}
            </button>
            <button
              className="btn-stop"
              data-testid="server-stop-button"
              onClick={onStop}
              title={t('server.actions.stop')}
              disabled={!isOnline}
            >
              ■ {t('server.actions.stop')}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
