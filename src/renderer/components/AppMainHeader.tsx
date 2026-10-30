import { Play, RotateCw, Square } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from '@/components/arc/button/button';
import { Tooltip } from '@/components/arc/tooltip/tooltip';
import type { Translate } from '../../i18n';
import { useMediaQuery } from '../hooks/use-media-query';
import type { AppView, MinecraftServer } from '../shared/server declaration';
import { canStartServer } from '../shared/server-status';
import { getViewLabel } from '../shared/view-labels';
import styles from './AppMainHeader.module.css';

interface AppMainHeaderProps {
  currentView: AppView;
  headerTitle: string;
  activeServerStatus: MinecraftServer['status'] | undefined;
  onStart: () => void;
  onRestart: () => void;
  onStop: () => void;
  t: Translate;
}

/** Views that act on the selected server. Start, restart and stop are hidden on every other view. */
const SERVER_ACTION_VIEWS: ReadonlySet<AppView> = new Set<AppView>([
  'dashboard',
  'console',
  'users',
  'files',
  'plugins',
  'backups',
  'properties',
  'general-settings',
]);

/** Under 900px the header keeps only icons, and each one names itself through a tooltip and aria-label. */
const COMPACT_QUERY = '(max-width: 899px)';

interface ServerActionProps {
  compact: boolean;
  label: string;
  icon: ReactNode;
  variant: ButtonVariant;
  testId: string;
  disabled: boolean;
  onClick: () => void;
}

function ServerAction({
  compact,
  label,
  icon,
  variant,
  testId,
  disabled,
  onClick,
}: ServerActionProps) {
  const button = (
    <Button
      type="button"
      variant={variant}
      size="sm"
      data-testid={testId}
      title={compact ? undefined : label}
      aria-label={compact ? label : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {compact ? null : label}
    </Button>
  );

  return compact ? (
    <Tooltip content={label} side="bottom">
      {button}
    </Tooltip>
  ) : (
    button
  );
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
  const compact = useMediaQuery(COMPACT_QUERY);
  const canStart = canStartServer(activeServerStatus);
  const isOnline = activeServerStatus === 'online';
  const subtitle = getViewLabel(currentView, t);
  // Static views repeat their title as the subtitle (settings, proxy). Show the pair only when they differ.
  const showSubtitle = subtitle !== headerTitle;
  const showServerActions = SERVER_ACTION_VIEWS.has(currentView);

  return (
    <header
      className={[styles.header, compact ? styles.headerCompact : ''].filter(Boolean).join(' ')}
      data-testid="app-main-header"
    >
      <div className={styles.titleGroup}>
        <h2 className={`app-main__title ${styles.title}`}>{headerTitle}</h2>
        {showSubtitle && (
          <span className={`app-main__subtitle ${styles.subtitle}`}>
            {' / '}
            {subtitle}
          </span>
        )}
      </div>
      {showServerActions && (
        <div className={styles.actions}>
          <ServerAction
            compact={compact}
            label={t('server.actions.start')}
            icon={<Play size={14} strokeWidth={1.75} fill="currentColor" aria-hidden={true} />}
            variant="primary"
            testId="server-start-button"
            disabled={!canStart}
            onClick={onStart}
          />
          <ServerAction
            compact={compact}
            label={t('server.actions.restart')}
            icon={<RotateCw size={14} strokeWidth={1.75} aria-hidden={true} />}
            variant="secondary"
            testId="server-restart-button"
            disabled={!isOnline}
            onClick={onRestart}
          />
          <ServerAction
            compact={compact}
            label={t('server.actions.stop')}
            icon={<Square size={13} strokeWidth={1.75} fill="currentColor" aria-hidden={true} />}
            variant="danger"
            testId="server-stop-button"
            disabled={!isOnline}
            onClick={onStop}
          />
        </div>
      )}
    </header>
  );
}
