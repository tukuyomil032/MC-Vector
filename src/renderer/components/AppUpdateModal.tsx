import { cn } from '@/lib/ui';
import * as Dialog from '@radix-ui/react-dialog';
import type { Translate } from '../../i18n';
import { Button } from './ui/Button';
import { Progress } from './ui/Progress';
import ReleaseNotes from './ReleaseNotes';

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

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) {
          onDismiss();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="app-update-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          data-theme="dark"
          className={cn(
            'app-update-modal',
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10001]',
          )}
          // ダウンロード中はEscape/背景クリックで閉じない
          onEscapeKeyDown={isDownloading ? (e) => e.preventDefault() : undefined}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className="app-update-modal__title mt-0 mb-2 text-xl font-semibold">
            {updatePrompt
              ? t('settings.update.available', { version: updatePrompt.version || '?' })
              : t('settings.update.title')}
          </Dialog.Title>

          {updatePrompt && (
            <ReleaseNotes
              releaseNotes={updatePrompt.releaseNotes}
              version={updatePrompt.version}
              label={t('settings.update.releaseNotes')}
              className="mb-4"
            />
          )}

          {updateError && (
            <div className="mb-4 text-sm text-red-400">
              {t('settings.update.error', { message: updateError })}
            </div>
          )}

          {updatePrompt && updateProgress !== null && !updateReady && (
            <div className="mb-4">
              <div className="app-update-modal__progress-label mb-1 text-sm text-zinc-300">
                {t('settings.update.downloading', { progress: Math.round(updateProgress) })}
              </div>
              <Progress value={Math.min(100, Math.round(updateProgress))} className="mt-2" />
            </div>
          )}

          {updatePrompt && updateReady && (
            <div className="mb-4 text-sm text-green-400">{t('settings.update.downloaded')}</div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onDismiss}>
              {t('common.cancel')}
            </Button>
            {updatePrompt && !updateReady && (
              <Button
                variant="accent"
                data-testid="update-modal-download-button"
                onClick={onUpdateNow}
                disabled={isDownloading}
              >
                {t('settings.update.download')}
              </Button>
            )}
            {updatePrompt && updateReady && (
              <Button variant="accent" onClick={onInstall}>
                {t('settings.update.restart')}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
