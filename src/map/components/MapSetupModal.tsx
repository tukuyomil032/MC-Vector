import { cn } from '@/lib/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { Map as MapIcon, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '../../i18n';
import type { MinecraftServer } from '../../renderer/shared/server declaration';
import { Button } from '../../renderer/components/ui/Button';
import type { MapCoreArtifactProgressEvent, MapCoreArtifactStatus } from '../state/map-types';

interface MapSetupModalProps {
  server: MinecraftServer | null;
  onEnable: () => Promise<void>;
  onSkip: () => Promise<void>;
  coreProgress?: MapCoreArtifactProgressEvent | null;
  coreStatus?: MapCoreArtifactStatus | null;
}

export default function MapSetupModal({
  server,
  onEnable,
  onSkip,
  coreProgress,
  coreStatus,
}: MapSetupModalProps) {
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

  const coreProvenanceLabel = () => {
    switch (coreStatus?.provenance) {
      case 'development':
        return t('map.management.coreProvenanceDevelopment');
      case 'bundled':
        return t('map.management.coreProvenanceBundled');
      case 'github_release':
        return t('map.management.coreProvenanceGithubRelease');
      default:
        return '—';
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

          {coreProgress && (
            <div
              className="mt-4 rounded-md border border-border-subtle bg-surface-secondary p-3 text-sm text-text-secondary"
              aria-live="polite"
            >
              <strong className="block text-text-primary">
                {coreProgress.state === 'downloading'
                  ? t('map.management.coreDownloading')
                  : coreProgress.state === 'verifying'
                    ? t('map.management.coreVerifying')
                    : coreProgress.state === 'error'
                      ? t('map.management.coreError')
                      : t('map.management.coreInstalled')}
              </strong>
              {coreProgress.totalBytes && coreProgress.totalBytes > 0 && (
                <span>
                  {Math.round((coreProgress.downloadedBytes / coreProgress.totalBytes) * 100)}%
                </span>
              )}
            </div>
          )}

          {coreStatus && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-text-secondary">
              <div>
                <dt>{t('map.management.coreVersion')}</dt>
                <dd className="text-text-primary">{coreStatus.version ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('map.management.coreProvenance')}</dt>
                <dd className="text-text-primary">{coreProvenanceLabel()}</dd>
              </div>
            </dl>
          )}

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
              {coreProgress?.state === 'error'
                ? t('map.management.coreRetry')
                : t('map.setupEnable')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
