import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Card } from '@/components/arc/card/card';
import { Download, ExternalLink, Star, User } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import type { CompatibilityStatus, ProjectItem, UpdateStatus } from './plugin-model';
import styles from './plugin-browser.module.css';

export type InstalledState = 'none' | 'enabled' | 'disabled';
export type InstallBusy = 'idle' | 'preparing' | 'installing';

export interface PluginResultCardState {
  installedState: InstalledState;
  compatibility: CompatibilityStatus;
  updateStatus: UpdateStatus | null;
  busy: InstallBusy;
  /** Download percentage while installing, when the provider reports it. */
  progress?: number;
  /** Inline message for an install that failed in a retryable way. */
  failureMessage: string | null;
}

interface PluginResultCardProps extends PluginResultCardState {
  item: ProjectItem;
  onInstall: (item: ProjectItem) => void;
  onDetails: (item: ProjectItem) => void;
  onRetry: (item: ProjectItem) => void;
}

/** Quiet, neutral badge for the compatibility the provider reported. Colour stays out of it. */
export function CompatibilityBadge({ status }: { status: CompatibilityStatus }) {
  const { t } = useTranslation();
  const label =
    status === 'compatible'
      ? t('plugins.browser.compatCompatible')
      : status === 'incompatible'
        ? t('plugins.browser.compatIncompatible')
        : status === 'checking'
          ? t('plugins.browser.compatChecking')
          : t('plugins.browser.compatUnknown');
  return (
    <Badge tone="neutral" data-compat={status}>
      {label}
    </Badge>
  );
}

/** The plugin icon, or the first letter of its name when the provider has no icon. */
export function PluginTile({ iconUrl, title }: { iconUrl?: string; title: string }) {
  return (
    <div className={styles.tile}>
      {iconUrl ? (
        <img className={styles.tileIcon} src={iconUrl} alt="" loading="lazy" />
      ) : (
        <span className={styles.monogram} aria-hidden="true">
          {title.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function PluginResultCard({
  item,
  installedState,
  compatibility,
  updateStatus,
  busy,
  progress,
  failureMessage,
  onInstall,
  onDetails,
  onRetry,
}: PluginResultCardProps) {
  const { t } = useTranslation();
  const requiresBrowser =
    item.platform === 'Spigot' &&
    (item.source_obj.external === true || item.source_obj.premium === true);
  const hasUpdateAction = installedState !== 'none' && updateStatus === 'update-available';
  const showInstallAction = installedState === 'none' || hasUpdateAction;

  const busyLabel =
    busy === 'installing'
      ? progress === undefined
        ? t('plugins.browser.installing')
        : t('plugins.browser.installingProgress', {
            progress,
            label: t('plugins.browser.installing'),
          })
      : busy === 'preparing'
        ? t('plugins.browser.preparing')
        : null;
  const installLabel =
    busyLabel ??
    (requiresBrowser
      ? t('plugins.browser.open')
      : hasUpdateAction
        ? t('plugins.browser.update')
        : t('plugins.install.button'));

  return (
    <Card
      className={[styles.resultCard, hasUpdateAction ? styles.updatable : ''].join(' ')}
      data-testid={`plugin-result-${item.id}`}
      title={item.title}
      description={item.description || t('plugins.browser.noDescription')}
      media={<PluginTile iconUrl={item.icon_url} title={item.title} />}
      action={
        <>
          {showInstallAction ? (
            <Button
              type="button"
              size="sm"
              variant="primary"
              data-testid={`plugin-install-${item.id}`}
              loading={busy !== 'idle'}
              onClick={() => onInstall(item)}
            >
              {requiresBrowser ? (
                <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Download size={14} strokeWidth={1.75} aria-hidden="true" />
              )}
              <span>{installLabel}</span>
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid={`plugin-details-${item.id}`}
            onClick={() => onDetails(item)}
          >
            {t('plugins.browser.details')}
          </Button>
        </>
      }
    >
      <div className={styles.meta}>
        <span className={styles.metaItem}>
          <User size={13} strokeWidth={1.75} aria-hidden="true" />
          <span>{item.author || t('plugins.browser.unknownAuthor')}</span>
        </span>
        <span className={styles.metaItem}>
          <Download size={13} strokeWidth={1.75} aria-hidden="true" />
          <span>{item.downloads ? item.downloads.toLocaleString() : '-'}</span>
        </span>
        {item.stars ? (
          <span className={styles.metaItem}>
            <Star size={13} strokeWidth={1.75} aria-hidden="true" />
            <span>{item.stars}</span>
          </span>
        ) : null}
      </div>
      <div className={styles.badges}>
        {installedState !== 'none' ? (
          <Badge tone="neutral">
            {installedState === 'disabled'
              ? t('plugins.browser.disabledBadge')
              : t('plugins.browser.installedBadge')}
          </Badge>
        ) : null}
        <CompatibilityBadge status={compatibility} />
        {requiresBrowser ? (
          <Badge tone="neutral">{t('plugins.browser.externalDownload')}</Badge>
        ) : null}
      </div>
      {failureMessage ? (
        <Alert tone="danger" title={failureMessage} data-testid={`plugin-install-error-${item.id}`}>
          <Button type="button" size="sm" variant="secondary" onClick={() => onRetry(item)}>
            {t('plugins.browser.retry')}
          </Button>
        </Alert>
      ) : null}
    </Card>
  );
}
