import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/ui';
import type { Translate } from '../../i18n';
import { Progress } from './ui/Progress';

interface UpdatePromptState {
  version?: string;
  releaseNotes?: unknown;
}

interface AppUpdateModalProps {
  updatePrompt: UpdatePromptState | null;
  updateProgress: number | null;
  updateError: string | null;
  updateReady: boolean;
  t: Translate;
  onDismiss: () => void;
  onUpdateNow: () => void;
  onInstall: () => void;
}

function getReleaseNotesText(releaseNotes: unknown): string {
  if (!releaseNotes) {
    return '';
  }
  if (typeof releaseNotes === 'string') {
    return releaseNotes;
  }
  if (!Array.isArray(releaseNotes)) {
    return '';
  }
  return releaseNotes
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (
        entry &&
        typeof entry === 'object' &&
        'body' in entry &&
        typeof (entry as Record<string, unknown>).body === 'string'
      ) {
        return (entry as Record<string, unknown>).body as string;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

export default function AppUpdateModal({
  updatePrompt,
  updateProgress,
  updateError,
  updateReady,
  t,
  onDismiss,
  onUpdateNow,
  onInstall,
}: AppUpdateModalProps) {
  const isOpen = !!(updatePrompt || updateError);
  const isDownloading = updateProgress !== null && !updateReady;
  const releaseNotesText = getReleaseNotesText(updatePrompt?.releaseNotes);

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) onDismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="app-update-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'app-update-modal',
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10001]',
          )}
          // ダウンロード中はEscape/背景クリックで閉じない
          onEscapeKeyDown={isDownloading ? (e) => e.preventDefault() : undefined}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className="app-update-modal__title">
            {updatePrompt
              ? t('settings.update.available', { version: updatePrompt.version || '?' })
              : t('settings.update.title')}
          </Dialog.Title>

          {releaseNotesText && updatePrompt && (
            <div className="mb-4">
              <div className="app-update-modal__notes-label">
                {t('settings.update.releaseNotes')}
              </div>
              <pre className="app-update-modal__notes">{releaseNotesText}</pre>
            </div>
          )}

          {updateError && (
            <div className="mb-4 text-sm text-red-400">
              {t('settings.update.error', { message: updateError })}
            </div>
          )}

          {updatePrompt && updateProgress !== null && !updateReady && (
            <div className="mb-4">
              <div className="app-update-modal__progress-label">
                {t('settings.update.downloading', { progress: Math.round(updateProgress) })}
              </div>
              <Progress value={Math.min(100, Math.round(updateProgress))} className="mt-2" />
            </div>
          )}

          {updatePrompt && updateReady && (
            <div className="mb-4 text-sm text-green-400">{t('settings.update.downloaded')}</div>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onDismiss}>
              {t('common.cancel')}
            </button>
            {updatePrompt && !updateReady && (
              <button className="btn-primary" onClick={onUpdateNow} disabled={isDownloading}>
                {t('settings.update.download')}
              </button>
            )}
            {updatePrompt && updateReady && (
              <button className="btn-primary" onClick={onInstall}>
                {t('settings.update.restart')}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
