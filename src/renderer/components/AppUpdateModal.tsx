import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Progress } from '@/components/arc/progress/progress';
import type { Translate } from '../../i18n';
import ReleaseNotes from './ReleaseNotes';
import styles from './AppUpdateModal.module.css';

interface UpdatePromptState {
  version?: string;
  releaseNotes?: unknown;
}

interface AppUpdateModalProps {
  open: boolean;
  updatePrompt: UpdatePromptState | null;
  updateProgress: number | null;
  updateError: string | null;
  updateReady: boolean;
  t: Translate;
  onDismiss: () => void;
  onUpdateNow: () => void;
  onInstall: () => void;
}

export default function AppUpdateModal({
  open,
  updatePrompt,
  updateProgress,
  updateError,
  updateReady,
  t,
  onDismiss,
  onUpdateNow,
  onInstall,
}: AppUpdateModalProps) {
  // Each state is one screen: ready, downloading, failed, or an update waiting to be downloaded.
  const phase = updateReady
    ? 'ready'
    : updateProgress !== null
      ? 'downloading'
      : updateError
        ? 'error'
        : 'available';
  const percent = Math.min(100, Math.round(updateProgress ?? 0));

  const title =
    phase === 'ready'
      ? t('settings.update.readyTitle')
      : phase === 'downloading'
        ? t('settings.update.downloadingTitle')
        : phase === 'error'
          ? t('settings.update.title')
          : t('settings.update.availableTitle', { version: updatePrompt?.version || '?' });

  const footer =
    phase === 'ready' ? (
      <>
        <Button type="button" variant="secondary" onClick={onDismiss}>
          {t('settings.update.later')}
        </Button>
        <Button
          type="button"
          variant="primary"
          data-testid="update-modal-restart"
          onClick={onInstall}
        >
          {t('settings.update.restart')}
        </Button>
      </>
    ) : phase === 'downloading' ? (
      <Button type="button" variant="secondary" onClick={onDismiss}>
        {t('common.close')}
      </Button>
    ) : phase === 'error' ? (
      <>
        <Button type="button" variant="secondary" onClick={onDismiss}>
          {t('common.close')}
        </Button>
        <Button
          type="button"
          variant="primary"
          data-testid="update-modal-retry"
          onClick={onUpdateNow}
        >
          {t('settings.update.retry')}
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="secondary" onClick={onDismiss}>
          {t('settings.update.later')}
        </Button>
        <Button
          type="button"
          variant="primary"
          data-testid="update-modal-download-button"
          onClick={onUpdateNow}
        >
          {t('settings.update.download')}
        </Button>
      </>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        data-testid="app-update-modal"
        title={title}
        width="min(520px, calc(100vw - var(--space-8)))"
        footer={footer}
      >
        <div className={styles.body}>
          {phase === 'available' && updatePrompt && (
            <ReleaseNotes
              releaseNotes={updatePrompt.releaseNotes}
              version={updatePrompt.version}
              label={t('settings.update.releaseNotes')}
            />
          )}

          {phase === 'downloading' && (
            <div className={styles.progress}>
              <Progress
                value={percent}
                max={100}
                label={t('settings.update.downloadingLabel')}
                showValue
              />
              <p className={styles.hint}>{t('settings.update.downloadHint')}</p>
            </div>
          )}

          {phase === 'error' && (
            <Alert tone="danger" title={t('settings.update.errorTitle')}>
              {updateError}
            </Alert>
          )}

          {phase === 'ready' && <Alert tone="success" title={t('settings.update.downloaded')} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
