import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Checkbox } from '@/components/arc/checkbox/checkbox';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { useTranslation } from '@/i18n';
import { logError } from '@/lib/error-utils';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { PendingServerEula } from '../hooks/use-server-eula-gate';
import styles from './ServerEulaModal.module.css';

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
  // The last request stays on screen while the dialog animates out, so the body does not blank mid-exit.
  const lastPending = useRef(pending);
  if (pending) lastPending.current = pending;
  const view = pending ?? lastPending.current;

  useEffect(() => {
    if (!pending?.server.id) return;
    setChecked(false);
    setIsSubmitting(false);
  }, [pending?.server.id]);

  const handleOpenEula = async (event: MouseEvent<HTMLAnchorElement>) => {
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

  // Saving the EULA writes a file, so the dialog cannot be dismissed until the write settles.
  const blockDismiss = (event: Event) => event.preventDefault();

  const footer = (
    <>
      <Button
        type="button"
        variant="secondary"
        data-testid="server-eula-cancel"
        onClick={onCancel}
        disabled={isSubmitting}
      >
        {t('common.cancel')}
      </Button>
      <Button
        type="button"
        variant="primary"
        data-testid="server-eula-accept"
        onClick={() => void handleAccept()}
        disabled={!checked || isSubmitting}
        loading={isSubmitting}
      >
        {isSubmitting ? t('server.eula.saving') : t('server.eula.acceptAndStart')}
      </Button>
    </>
  );

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onCancel();
      }}
    >
      <DialogContent
        data-testid="server-eula-modal"
        title={t('server.eula.title')}
        description={view ? t('server.eula.description', { name: view.server.name }) : undefined}
        width="min(520px, calc(100vw - var(--space-8)))"
        onEscapeKeyDown={isSubmitting ? blockDismiss : undefined}
        onPointerDownOutside={isSubmitting ? blockDismiss : undefined}
        footer={footer}
      >
        {view && (
          <div className={styles.body}>
            <Alert
              tone="warning"
              title={
                view.fileExists ? t('server.eula.fileNotAccepted') : t('server.eula.fileMissing')
              }
            >
              <p>{t('server.eula.explanation')}</p>
              <a
                href={MINECRAFT_EULA_URL}
                target="_blank"
                rel="noreferrer"
                data-testid="server-eula-link"
                className={styles.link}
                onClick={handleOpenEula}
              >
                {t('server.eula.openLink')}
              </a>
            </Alert>

            <Checkbox
              data-testid="server-eula-checkbox"
              checked={checked}
              onCheckedChange={(next) => setChecked(next === true)}
              label={t('server.eula.consentLabel')}
            />

            {view.error && (
              <Alert
                tone="danger"
                title={t('server.eula.writeError')}
                data-testid="server-eula-error"
              >
                {view.error}
              </Alert>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
