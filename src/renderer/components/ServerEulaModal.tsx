import { useTranslation } from '@/i18n';
import { logError } from '@/lib/error-utils';
import { cn } from '@/lib/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useEffect, useState } from 'react';
import type { PendingServerEula } from '../hooks/use-server-eula-gate';
import { Button } from './ui/Button';

export const MINECRAFT_EULA_URL = 'https://www.minecraft.net/en-us/eula';

interface ServerEulaModalProps {
  pending: PendingServerEula | null;
  onAccept: () => Promise<boolean>;
  onCancel: () => void;
}

export default function ServerEulaModal({ pending, onAccept, onCancel }: ServerEulaModalProps) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!pending?.server.id) return;
    setChecked(false);
    setIsSubmitting(false);
  }, [pending?.server.id]);

  const handleOpenEula = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      await openUrl(MINECRAFT_EULA_URL);
    } catch (error) {
      logError('Failed to open Minecraft EULA', error);
    }
  };

  const handleAccept = async () => {
    if (!checked || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    const accepted = await onAccept();
    if (!accepted) {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="mc-modal-overlay" />
        <Dialog.Content
          data-testid="server-eula-modal"
          className={cn(
            'mc-modal-panel w-[min(520px,calc(100vw-2rem))] max-w-full',
            'fixed left-1/2 top-1/2 z-[1001] -translate-x-1/2 -translate-y-1/2',
          )}
        >
          {pending && (
            <>
              <Dialog.Title className="mb-2 mt-0 border-b border-zinc-700 pb-2.5 text-xl">
                {t('server.eula.title')}
              </Dialog.Title>
              <Dialog.Description className="mb-4 text-sm leading-6 text-text-secondary">
                {t('server.eula.description', { name: pending.server.name })}
              </Dialog.Description>

              <div className="mb-4 rounded-lg border border-[var(--mv-border-soft)] bg-black/10 p-3 text-sm leading-6 text-text-secondary">
                <p className="mb-2 font-medium text-text-primary">
                  {pending.fileExists
                    ? t('server.eula.fileNotAccepted')
                    : t('server.eula.fileMissing')}
                </p>
                <p>{t('server.eula.explanation')}</p>
                <a
                  href={MINECRAFT_EULA_URL}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="server-eula-link"
                  className="mt-2 inline-flex min-h-11 items-center text-accent underline underline-offset-4 hover:text-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={handleOpenEula}
                >
                  {t('server.eula.openLink')}
                </a>
              </div>

              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 text-sm leading-6 text-text-primary hover:bg-white/5 focus-within:ring-2 focus-within:ring-accent">
                <input
                  type="checkbox"
                  data-testid="server-eula-checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                  className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span>{t('server.eula.consentLabel')}</span>
              </label>

              {pending.error && (
                <p
                  role="alert"
                  data-testid="server-eula-error"
                  className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
                >
                  {t('server.eula.writeError')}: {pending.error}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2.5">
                <Button
                  type="button"
                  variant="modalSecondary"
                  data-testid="server-eula-cancel"
                  onClick={onCancel}
                  disabled={isSubmitting}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  variant="modalPrimary"
                  data-testid="server-eula-accept"
                  onClick={() => void handleAccept()}
                  disabled={!checked || isSubmitting}
                >
                  {isSubmitting ? t('server.eula.saving') : t('server.eula.acceptAndStart')}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
