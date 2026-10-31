import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '../../../i18n';
import { CompatibilityBadge } from './PluginResultCard';
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
          width="min(640px, calc(100vw - 2rem))"
          footer={
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.close')}
            </Button>
          }
        >
          <div className={styles.detailBody}>
            <div className={styles.detailMeta}>
              <CompatibilityBadge status={compatibility} />
            </div>

            <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)}>
              <TabsList aria-label={t('plugins.browser.detailInfo')}>
                <TabsTrigger value="info">{t('plugins.browser.detailInfo')}</TabsTrigger>
                <TabsTrigger value="readme">{t('plugins.browser.detailReadme')}</TabsTrigger>
              </TabsList>

              <TabsContent value="info">
                <dl className={styles.detailRows}>
                  <dt>{t('plugins.browser.detailProject')}</dt>
                  <dd>{item.id}</dd>
                  <dt>{t('plugins.browser.detailSlug')}</dt>
                  <dd>{item.slug || t('plugins.browser.na')}</dd>
                  <dt>{t('plugins.browser.detailSupportedMC')}</dt>
                  <dd>{supportedVersionsLabel}</dd>
                  <dt>{t('plugins.browser.detailLoader')}</dt>
                  <dd>{loaderLabel}</dd>
                  <dt>{t('plugins.browser.detailDownloads')}</dt>
                  <dd>{item.downloads ? item.downloads.toLocaleString() : '-'}</dd>
                  <dt>{t('plugins.browser.detailSummary')}</dt>
                  <dd>{item.description || t('plugins.browser.noDescription')}</dd>
                </dl>
                <div>
                  <Button type="button" variant="secondary" size="sm" onClick={onOpenProject}>
                    <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>{t('plugins.browser.detailProjectPage')}</span>
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="readme">
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
                  <div className={styles.readme}>
                    <PluginReadme markdown={readme.content} onOpenLink={onOpenLink} />
                  </div>
                ) : (
                  <p className={styles.readmeNote}>{t('plugins.browser.noReadme')}</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
