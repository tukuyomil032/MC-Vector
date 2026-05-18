import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/ui'
import { useTranslation } from '../../i18n';

interface AddServerChoiceModalProps {
  open: boolean;
  onClose: () => void;
  onNewServer: () => void;
  onImportServer: () => void;
}

export default function AddServerChoiceModal({
  open,
  onClose,
  onNewServer,
  onImportServer,
}: AddServerChoiceModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="mc-modal-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'mc-modal-panel',
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1001]',
          )}
        >
          <Dialog.Title className="mc-modal-title">
            {t('addServer.choice.title')}
          </Dialog.Title>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="flex flex-col items-start gap-1 p-4 rounded-lg border border-zinc-700 bg-transparent text-left hover:bg-zinc-800 transition-colors"
              onClick={() => {
                onNewServer();
                onClose();
              }}
            >
              <span className="text-white font-semibold">{t('addServer.choice.newServer')}</span>
              <span className="text-zinc-400 text-sm">{t('addServer.choice.newServerHint')}</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-start gap-1 p-4 rounded-lg border border-zinc-700 bg-transparent text-left hover:bg-zinc-800 transition-colors"
              onClick={() => {
                onImportServer();
                onClose();
              }}
            >
              <span className="text-white font-semibold">{t('addServer.choice.importServer')}</span>
              <span className="text-zinc-400 text-sm">{t('addServer.choice.importServerHint')}</span>
            </button>
          </div>
          <div className="mc-modal-footer">
            <Dialog.Close asChild>
              <button type="button" className="mc-modal-btn-secondary">
                {t('common.cancel')}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
