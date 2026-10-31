import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Puzzle } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { EmptyLine } from '../ui/EmptyLine';
import { SectionTitle } from '../ui/IconTile';
import { PluginTile } from './PluginResultCard';
import type { InstalledPluginEntry, UpdateStatus } from './plugin-model';
import styles from './plugin-browser.module.css';

export interface PluginInstalledPanelProps {
  folderName: string;
  entries: InstalledPluginEntry[];
  updateStatusByItemId: Record<string, UpdateStatus>;
  latestFileByItemId: Record<string, string>;
  installingId: string | null;
  busyInstalledFile: string | null;
  installingLabel: (itemId: string) => string;
  onUninstall: (entry: InstalledPluginEntry) => void;
  onReinstall: (entry: InstalledPluginEntry) => void;
  onToggle: (entry: InstalledPluginEntry) => void;
}

export function PluginInstalledPanel({
  folderName,
  entries,
  updateStatusByItemId,
  latestFileByItemId,
  installingId,
  busyInstalledFile,
  installingLabel,
  onUninstall,
  onReinstall,
  onToggle,
}: PluginInstalledPanelProps) {
  const { t } = useTranslation();

  const updateStatusLabel = (status: UpdateStatus): string => {
    switch (status) {
      case 'checking':
        return t('plugins.browser.updateChecking');
      case 'update-available':
        return t('plugins.browser.updateAvailable');
      case 'up-to-date':
        return t('plugins.browser.upToDate');
      default:
        return t('plugins.browser.updateUnknown');
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.installedHeader}>
        <div>
          <SectionTitle icon={Puzzle} title={t('plugins.installed.title')} />
          <p className={styles.folder}>
            {t('plugins.browser.installedFolder', { folder: folderName })}
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyLine title={t('plugins.installed.empty')} />
      ) : (
        <div className={styles.grid}>
          {entries.map((entry) => {
            const isProcessing =
              busyInstalledFile === entry.normalizedFileName ||
              installingId === entry.actionItem.id;
            const canReinstall = Boolean(entry.sourceItem);
            const installedUpdateStatus = entry.sourceItem
              ? (updateStatusByItemId[entry.sourceItem.id] ?? null)
              : null;
            const statusBadge =
              installedUpdateStatus === 'update-available' || installedUpdateStatus === 'up-to-date'
                ? installedUpdateStatus
                : null;
            const latestFileName = entry.sourceItem
              ? (latestFileByItemId[entry.sourceItem.id] ?? null)
              : null;
            const reinstalling = installingId === entry.actionItem.id;

            return (
              <article key={entry.fileName} className={styles.resultCard}>
                <PluginTile iconUrl={entry.iconUrl} title={entry.displayName} />

                <div className={styles.cardBody}>
                  <div className={styles.cardHead}>
                    <h3 className={styles.cardTitle} title={entry.displayName}>
                      {entry.displayName}
                    </h3>
                    <Badge tone="neutral">
                      {entry.state === 'disabled'
                        ? t('plugins.browser.disabledBadge')
                        : t('plugins.browser.installedBadge')}
                    </Badge>
                    {statusBadge ? (
                      <Badge
                        tone="neutral"
                        title={
                          statusBadge === 'update-available' && latestFileName
                            ? t('plugins.browser.latestTooltip', { fileName: latestFileName })
                            : undefined
                        }
                      >
                        {updateStatusLabel(statusBadge)}
                      </Badge>
                    ) : null}
                  </div>

                  <p className={styles.cardDescription}>
                    {entry.description || t('plugins.browser.noDescription')}
                  </p>

                  <dl className={styles.facts}>
                    <dt>{t('plugins.browser.installedSource')}</dt>
                    <dd>{entry.sourceItem?.platform ?? t('plugins.browser.localSource')}</dd>
                    <dt>{t('plugins.browser.installedFile')}</dt>
                    <dd className={styles.fileName}>{entry.fileName}</dd>
                    <dt>{t('plugins.browser.installedVersion')}</dt>
                    <dd>{entry.fileVersion || t('plugins.browser.na')}</dd>
                    <dt>{t('plugins.browser.installedGameVersions')}</dt>
                    <dd>
                      {entry.minecraftVersions.length > 0
                        ? entry.minecraftVersions.join(', ')
                        : t('plugins.browser.na')}
                    </dd>
                  </dl>

                  <div className={styles.cardActions}>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={isProcessing}
                      onClick={() => onUninstall(entry)}
                    >
                      {t('plugins.browser.uninstall')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={reinstalling}
                      disabled={isProcessing || !canReinstall}
                      onClick={() => onReinstall(entry)}
                    >
                      {reinstalling
                        ? installingLabel(entry.actionItem.id)
                        : t('plugins.browser.reinstall')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={isProcessing}
                      onClick={() => onToggle(entry)}
                    >
                      {entry.state === 'disabled'
                        ? t('plugins.browser.enable')
                        : t('plugins.browser.disable')}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
