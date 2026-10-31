import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Progress } from '@/components/arc/progress/progress';
import { type StepperStep, Stepper } from '@/components/arc/stepper/stepper';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import { createBackup, onBackupProgress } from '../../lib/backup-commands';
import { logError } from '../../lib/error-utils';
import {
  executeServerJarInstall,
  onDownloadProgress,
  prepareServerJarInstall,
} from '../../lib/server-commands';
import type { UnlistenFn } from '../../lib/tauri-api';
import { notify } from '../shared/notify';
import type { MinecraftServer } from '../shared/server declaration';
import styles from './VersionUpgradeWizard.module.css';

type WizardStep = 'check' | 'backup' | 'download' | 'done';

/** Stepper position per wizard step. `done` is past the last step, which marks the whole flow complete. */
const STEP_INDEX: Record<WizardStep, number> = { check: 0, backup: 1, download: 2, done: 4 };

interface Props {
  server: MinecraftServer;
  onClose: () => void;
  onServerVersionChanged: (version: string) => void;
}

export default function VersionUpgradeWizard({ server, onClose, onServerVersionChanged }: Props) {
  const { t } = useTranslation();

  const [step, setStep] = useState<WizardStep>('check');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [preparedPlanId, setPreparedPlanId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [dlProgress, setDlProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  // Step 1: fetch latest version on mount
  useEffect(() => {
    let cancelled = false;
    setPreparedPlanId(null);
    setLatestVersion(null);
    setUnsupported(false);
    setVerified(false);
    prepareServerJarInstall(server.id, server.software ?? '', server.version)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result === null) {
          setUnsupported(true);
        } else {
          setLatestVersion(result.latestVersion);
          setPreparedPlanId(result.planId);
          setVerified(result.verified);
        }
      })
      .catch(() => {
        if (!cancelled) setUnsupported(true);
      });
    return () => {
      cancelled = true;
    };
  }, [server.id, server.software, server.version]);

  const isOffline = server.status === 'offline';
  const isLatest = latestVersion !== null && latestVersion === server.version;

  // Step 2: backup
  const handleBackup = async () => {
    setProcessing(true);
    setBackupProgress(0);
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await onBackupProgress(({ serverId, progress }) => {
        if (serverId === server.id) {
          // The backend already reports 0-100 (see backup.rs), so no scaling here.
          setBackupProgress(Math.round(progress));
        }
      });
      const backupName = `pre-upgrade-${Date.now()}`;
      const outcome = await createBackup(server.id, backupName, undefined, false);
      if (outcome.status === 'confirmation_required') {
        // Version upgrades require the server to stay offline after this step.
        // Do not use the normal stop-and-restart backup flow here.
        notify.error(t('serverSettings.versionUpgrade.serverMustBeOffline'));
        return;
      }
      if (outcome.status === 'failed') {
        logError('Pre-upgrade backup operation failed', outcome.error, {
          serverId: server.id,
          serverPath: server.path,
          stage: outcome.stage,
          restartError: outcome.restartError,
        });
        if (outcome.restartError) {
          notify.error(t('backups.toast.backupNotCreatedRestartFailed', { name: server.name }));
        } else {
          notify.error(
            outcome.stage === 'stop'
              ? t('backups.toast.serverStopFailed')
              : t('serverSettings.versionUpgrade.backupFailed'),
          );
        }
        return;
      }
      if (outcome.catalogError) {
        logError('Failed to update managed backup catalog', outcome.catalogError, {
          serverId: server.id,
          serverPath: server.path,
          backupName: outcome.backupName,
        });
        notify.warning(t('backups.toast.registryUpdateFailed'));
      }
      if (outcome.restart.status === 'failed') {
        logError('Backup created but server restart failed', outcome.restart.error, {
          serverId: server.id,
          serverPath: server.path,
          backupName: outcome.backupName,
        });
        notify.warning(t('backups.toast.serverRestartFailed'));
      }
      setStep('download');
    } catch {
      notify.error(t('serverSettings.versionUpgrade.backupFailed'));
    } finally {
      unlisten?.();
      setProcessing(false);
    }
  };

  // Step 3: download
  const handleDownload = async () => {
    if (!preparedPlanId || !latestVersion || !verified) {
      return;
    }
    setProcessing(true);
    setDlProgress(0);
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await onDownloadProgress(({ serverId, progress }) => {
        if (serverId === server.id) {
          setDlProgress(Math.round(progress));
        }
      });
      const installed = await executeServerJarInstall(preparedPlanId);
      onServerVersionChanged(installed.version);
      setStep('done');
    } catch {
      notify.error(t('serverSettings.versionUpgrade.downloadFailed'));
    } finally {
      unlisten?.();
      setProcessing(false);
    }
  };

  const steps: StepperStep[] = [
    { id: 'check', label: t('serverSettings.versionUpgrade.stepCheck') },
    { id: 'backup', label: t('serverSettings.versionUpgrade.stepBackup') },
    { id: 'download', label: t('serverSettings.versionUpgrade.stepDownload') },
    { id: 'done', label: t('serverSettings.versionUpgrade.stepDone') },
  ];

  const closeButton = (
    <Button variant="secondary" onClick={onClose} disabled={processing}>
      {t('serverSettings.versionUpgrade.close')}
    </Button>
  );

  let footer: ReactNode;
  if (step === 'check') {
    footer = (
      <>
        {closeButton}
        {!unsupported && !isLatest && isOffline && latestVersion !== null && (
          <Button variant="primary" onClick={() => setStep('backup')}>
            {t('serverSettings.versionUpgrade.startUpgrade')}
          </Button>
        )}
      </>
    );
  } else if (step === 'backup') {
    footer = (
      <>
        {closeButton}
        <Button
          variant="primary"
          onClick={() => {
            void handleBackup();
          }}
          disabled={processing}
        >
          {t('serverSettings.versionUpgrade.runBackup')}
        </Button>
      </>
    );
  } else if (step === 'download') {
    footer = (
      <>
        {closeButton}
        <Button
          variant="primary"
          onClick={() => {
            void handleDownload();
          }}
          disabled={processing || !preparedPlanId || !verified}
        >
          {t('serverSettings.versionUpgrade.runDownload')}
        </Button>
      </>
    );
  } else {
    footer = (
      <Button variant="primary" onClick={onClose}>
        {t('serverSettings.versionUpgrade.close')}
      </Button>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !processing) onClose();
      }}
    >
      <DialogContent
        title={t('serverSettings.versionUpgrade.title')}
        width="min(560px, calc(100vw - var(--space-8)))"
        footer={footer}
        data-testid="version-upgrade-wizard"
      >
        <Stepper
          steps={steps}
          current={STEP_INDEX[step]}
          label={t('serverSettings.versionUpgrade.stepsLabel')}
          completeLabel={t('serverSettings.versionUpgrade.stepDone')}
        />

        {/* Step: check */}
        {step === 'check' && (
          <div className={styles.stack}>
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>{t('serverSettings.versionUpgrade.currentVersion')}</dt>
                <dd>{server.version}</dd>
              </div>
              <div className={styles.fact}>
                <dt>{t('serverSettings.versionUpgrade.latestVersion')}</dt>
                <dd>{latestVersion ?? t('serverSettings.versionUpgrade.fetching')}</dd>
              </div>
            </dl>

            {unsupported && (
              <Alert tone="danger" open title={t('serverSettings.versionUpgrade.unsupported')} />
            )}

            {!unsupported && isLatest && (
              <Alert tone="success" open title={t('serverSettings.versionUpgrade.alreadyLatest')} />
            )}

            {!unsupported && !isOffline && (
              <Alert
                tone="warning"
                open
                title={t('serverSettings.versionUpgrade.serverMustBeOffline')}
              />
            )}
          </div>
        )}

        {/* Step: backup */}
        {step === 'backup' && (
          <div className={styles.stack}>
            <p className={styles.text}>{t('serverSettings.versionUpgrade.backupDescription')}</p>
            {(processing || backupProgress > 0) && (
              <Progress
                value={backupProgress}
                max={100}
                label={t('serverSettings.versionUpgrade.backupProgressLabel')}
                showValue
              />
            )}
          </div>
        )}

        {/* Step: download */}
        {step === 'download' && (
          <div className={styles.stack}>
            <p className={styles.text}>{t('serverSettings.versionUpgrade.downloadDescription')}</p>
            {(processing || dlProgress > 0) && (
              <Progress
                value={dlProgress}
                max={100}
                label={t('serverSettings.versionUpgrade.downloadProgressLabel')}
                showValue
              />
            )}
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div className={styles.stack}>
            <p className={styles.text}>{t('serverSettings.versionUpgrade.doneDescription')}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
