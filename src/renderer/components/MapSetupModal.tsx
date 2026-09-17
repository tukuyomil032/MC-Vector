import { cn } from '@/lib/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { Map as MapIcon, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '../../i18n';
import type { MinecraftServer } from '../shared/server declaration';
import { Button } from './ui/Button';

interface MapSetupModalProps {
  server: MinecraftServer | null;
  onEnable: () => Promise<void>;
  onSkip: () => Promise<void>;
}

export default function MapSetupModal({ server, onEnable, onSkip }: MapSetupModalProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (action: () => Promise<void>) => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await action();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={server !== null} onOpenChange={() => undefined}>
      <Dialog.Portal>
        <Dialog.Overlay className="mc-modal-overlay" />
        <Dialog.Content
          data-testid="map-setup-modal"
          aria-describedby="map-setup-description"
          className={cn(
            'mc-modal-panel w-[min(560px,calc(100vw-2rem))] max-w-full',
            'fixed left-1/2 top-1/2 z-[1001] -translate-x-1/2 -translate-y-1/2',
          )}
        >
          <Dialog.Title className="mb-2 mt-0 flex items-center gap-2 border-b border-zinc-700 pb-2.5 text-xl">
            <MapIcon size={21} aria-hidden="true" />
            {t('map.setupTitle')}
          </Dialog.Title>
          <Dialog.Description
            id="map-setup-description"
            className="mb-4 text-sm leading-6 text-text-secondary"
          >
            {server?.name ? `${server.name}: ` : ''}
            {t('map.setupDescription')}
          </Dialog.Description>

          <div className="map-setup-modal__notice">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>{t('map.featureDescription')}</span>
          </div>

          <div className="mt-5 flex justify-end gap-2.5">
            <Button
              type="button"
              variant="modalSecondary"
              data-testid="map-setup-skip"
              onClick={() => void submit(onSkip)}
              disabled={isSubmitting}
            >
              {t('map.setupSkip')}
            </Button>
            <Button
              type="button"
              variant="modalPrimary"
              data-testid="map-setup-enable"
              onClick={() => void submit(onEnable)}
              disabled={isSubmitting || server === null}
            >
              {t('map.setupEnable')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
