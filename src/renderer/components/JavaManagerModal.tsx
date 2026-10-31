import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { Progress } from '@/components/arc/progress/progress';
import { Coffee } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import { copyToClipboard } from '../../lib/clipboard-commands';
import { logError } from '../../lib/error-utils';
import {
  type JavaVersion,
  deleteJava,
  downloadJava,
  getJavaVersions,
  onJavaDownloadProgress,
  selectJavaBinary,
} from '../../lib/java-commands';
import { notify } from '../shared/notify';
import { useAppFeedback } from './AppFeedbackProvider';
import styles from './JavaManagerModal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

const AVAILABLE_VERSIONS = [8, 17, 21];

export default function JavaManagerModal({ open: isOpen, onClose }: Props) {
  const [installed, setInstalled] = useState<JavaVersion[]>([]);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const { t } = useTranslation();
  const { confirm } = useAppFeedback();
  const isDownloading = downloading !== null;

  useEffect(() => {
    loadInstalled();

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void onJavaDownloadProgress((data) => {
      setDownloadProgress(typeof data.progress === 'number' ? data.progress : null);
    }).then((u) => {
      if (cancelled) {
        u();
        return;
      }
      unlisten = u;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const loadInstalled = async () => {
    const list = await getJavaVersions();
    setInstalled(list);
  };

  const handleDownload = async (version: number) => {
    setDownloading(version);
    setDownloadProgress(0);
    try {
      const ok = await downloadJava(version);
      await loadInstalled();
      if (ok) {
        notify.success(t('javaManager.toast.downloadSuccess', { version }));
      } else {
        notify.error(t('javaManager.toast.downloadFailed'));
      }
    } catch (error) {
      logError('Java download failed', error, { version });
      notify.error(t('javaManager.toast.downloadFailed'));
    } finally {
      setDownloading(null);
      setDownloadProgress(null);
    }
  };

  const handleDelete = async (version: number) => {
    const confirmed = await confirm({
      title: t('javaManager.confirm.deleteTitle'),
      description: t('javaManager.confirm.uninstall', { version }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteJava(version);
      await loadInstalled();
      notify.info(t('javaManager.toast.removed', { version }));
    } catch (error) {
      logError('Java removal failed', error, { version });
      notify.error(t('javaManager.toast.removeFailed', { version }));
    }
  };

  const handleSelectExisting = async () => {
    const picked = await selectJavaBinary();
    if (!picked) {
      notify.info(t('javaManager.toast.selectionCancelled'));
      return;
    }
    try {
      await copyToClipboard(picked);
      notify.success(t('javaManager.toast.pathCopied'));
    } catch {
      notify.info(t('javaManager.toast.pathInfo', { path: picked }));
    }
  };

  // A download writes into the app data folder, so the window stays until it settles.
  const blockDismiss = (event: Event) => event.preventDefault();

  const footer = (
    <Button
      type="button"
      variant="secondary"
      data-testid="java-manager-close"
      disabled={isDownloading}
      onClick={onClose}
    >
      {t('common.close')}
    </Button>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !isDownloading) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        data-testid="java-manager-dialog"
        title={t('javaManager.title')}
        width="min(560px, calc(100vw - var(--space-8)))"
        footer={footer}
        onEscapeKeyDown={isDownloading ? blockDismiss : undefined}
        onPointerDownOutside={isDownloading ? blockDismiss : undefined}
      >
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('javaManager.availableVersions')}</h3>
          <div className={styles.cards}>
            {AVAILABLE_VERSIONS.map((version) => {
              const isInstalled = installed.some((item) => item.version === version);
              const isThisDownloading = downloading === version;
              return (
                <article key={version} className={styles.card} data-testid={`java-card-${version}`}>
                  <div className={styles.cardHead}>
                    <span className={styles.cardTitle}>
                      {t('javaManager.versionTitle', { version })}
                    </span>
                    {isInstalled && (
                      <Badge tone="success" data-testid={`java-installed-${version}`}>
                        {t('javaManager.installed')}
                      </Badge>
                    )}
                  </div>
                  {isThisDownloading ? (
                    <Progress
                      value={downloadProgress ?? 0}
                      max={100}
                      label={t('javaManager.downloadingLabel')}
                      showValue
                    />
                  ) : (
                    !isInstalled && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        data-testid={`java-download-${version}`}
                        disabled={isDownloading}
                        onClick={() => void handleDownload(version)}
                      >
                        {t('javaManager.download')}
                      </Button>
                    )
                  )}
                </article>
              );
            })}
          </div>
          {downloading !== null && (
            <p role="status" className={styles.status} data-testid="java-download-status">
              {t('javaManager.downloadStatus', { version: downloading })}
            </p>
          )}
        </section>

        <section className={styles.manual}>
          <div className={styles.manualCopy}>
            <h3 className={styles.sectionTitle}>{t('javaManager.manualSelect.title')}</h3>
            <p className={styles.note}>{t('javaManager.manualSelect.description')}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isDownloading}
            onClick={() => void handleSelectExisting()}
          >
            {t('javaManager.manualSelect.button')}
          </Button>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('javaManager.installedRuntimes')}</h3>
          {installed.length === 0 ? (
            <EmptyState
              className={styles.empty}
              icon={<Coffee size={20} strokeWidth={1.75} aria-hidden={true} />}
              title={t('javaManager.emptyTitle')}
              description={t('javaManager.noRuntimes')}
            />
          ) : (
            <ul className={styles.runtimeList}>
              {installed.map((java) => (
                <li key={java.path} className={styles.runtimeRow}>
                  <div className={styles.runtimeText}>
                    <span className={styles.runtimeName}>{java.name}</span>
                    <span className={styles.runtimePath}>{java.path}</span>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => void handleDelete(java.version)}
                  >
                    {t('common.delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
