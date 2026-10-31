import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs';
import { Download, ExternalLink, Gamepad2, Loader2, Puzzle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '../../../i18n';
import { CompatibilityBadge, PluginTile } from './PluginResultCard';
import { PluginReadme } from './PluginReadme';
import type { CompatibilityStatus, DetailTab, ProjectItem } from './plugin-model';
import styles from './plugin-browser.module.css';

export interface PluginDetailReadme {
  loading: boolean;
  error: string | null;
  content: string | null;
}

export interface PluginDetailDialogProps {
  item: ProjectItem | null;
  compatibility: CompatibilityStatus;
  supportedVersionsLabel: string;
  loaderLabel: string;
  readme: PluginDetailReadme;
  onOpenProject: () => void;
  onOpenLink: (url: string) => void;
  onClose: () => void;
}

/** Details for one plugin. Parent keys it by plugin, so the chosen tab resets for each one. */
export function PluginDetailDialog({
  item,
  compatibility,
  supportedVersionsLabel,
  loaderLabel,
  readme,
  onOpenProject,
  onOpenLink,
  onClose,
}: PluginDetailDialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DetailTab>('info');

  return (
    <Dialog open={item !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {item ? (
        <DialogContent
          data-testid="plugin-detail-dialog"
          title={item.title}
          description={`${item.platform} · ${t('plugins.browser.byAuthor')} ${item.author || t('plugins.browser.unknownAuthor')}`}
          width="min(760px, calc(100vw - 2rem))"
          leading={<PluginTile iconUrl={item.icon_url} title={item.title} size="lg" />}
          trailing={<CompatibilityBadge status={compatibility} />}
          footer={
            <div className={styles.footerRow}>
              <Button type="button" variant="secondary" onClick={onOpenProject}>
                <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>{t('plugins.browser.detailProjectPage')}</span>
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.close')}
              </Button>
            </div>
          }
        >
          <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)}>
            <TabsList aria-label={t('plugins.browser.detailTabs')}>
              <TabsTrigger value="info">{t('plugins.browser.detailInfo')}</TabsTrigger>
              <TabsTrigger value="readme">{t('plugins.browser.detailReadme')}</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className={styles.detailPanel}>
              <dl className={styles.stats}>
                <div className={styles.stat}>
                  <dt>
                    <Download size={13} strokeWidth={1.75} aria-hidden="true" />
                    <span>{t('plugins.browser.detailDownloads')}</span>
                  </dt>
                  <dd>{item.downloads ? item.downloads.toLocaleString() : '-'}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>
                    <Gamepad2 size={13} strokeWidth={1.75} aria-hidden="true" />
                    <span>{t('plugins.browser.detailSupportedMC')}</span>
                  </dt>
                  <dd>{supportedVersionsLabel}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>
                    <Puzzle size={13} strokeWidth={1.75} aria-hidden="true" />
                    <span>{t('plugins.browser.detailLoader')}</span>
                  </dt>
                  <dd>{loaderLabel}</dd>
                </div>
              </dl>

              <p className={styles.summary}>
                {item.description || t('plugins.browser.noDescription')}
              </p>

              <p className={styles.quietLine}>
                {t('plugins.browser.detailProject')}: {item.id} · {t('plugins.browser.detailSlug')}:{' '}
                {item.slug || t('plugins.browser.na')}
              </p>
            </TabsContent>

            <TabsContent value="readme" className={styles.detailPanel}>
              {readme.loading ? (
                <>
                  <p className={styles.readmeNote}>
                    <Loader2 size={14} strokeWidth={1.75} aria-hidden="true" />{' '}
                    {t('plugins.browser.readmeLoading')}
                  </p>
                  <Skeleton label={t('plugins.browser.readmeLoading')} lines={4} />
                </>
              ) : readme.error ? (
                <Alert tone="danger" title={readme.error} />
              ) : readme.content ? (
                <PluginReadme markdown={readme.content} onOpenLink={onOpenLink} />
              ) : (
                <p className={styles.readmeNote}>{t('plugins.browser.noReadme')}</p>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
