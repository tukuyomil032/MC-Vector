import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from '../../i18n';
import { createBackup, onBackupProgress } from '../../lib/backup-commands';
import {
  executeServerJarInstall,
  onDownloadProgress,
  prepareServerJarInstall,
} from '../../lib/server-commands';
import type { UnlistenFn } from '../../lib/tauri-api';
import type { MinecraftServer } from '../shared/server declaration';
import { Button } from './ui/Button';

type WizardStep = 'check' | 'backup' | 'download' | 'done';

interface Props {
  server: MinecraftServer;
  onClose: () => void;
  onServerVersionChanged: (version: string) => void;
}

export default function VersionUpgradeWizard({ server, onClose, onServerVersionChanged }: Props) {
  const { t } = useTranslation();
  const showToast = (msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    if (type === 'success') {
      toast.success(msg);
    } else if (type === 'error') {
      toast.error(msg);
    } else if (type === 'warning') {
      toast.warning(msg);
    } else {
      toast(msg);
    }
  };

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
          setBackupProgress(Math.round(progress * 100));
        }
      });
      const backupName = `pre-upgrade-${Date.now()}`;
      await createBackup(server.id, backupName);
      setStep('download');
    } catch {
      showToast(t('serverSettings.versionUpgrade.backupFailed'), 'error');
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
      showToast(t('serverSettings.versionUpgrade.downloadFailed'), 'error');
    } finally {
      unlisten?.();
      setProcessing(false);
    }
  };

  return (
    <div className="mc-modal-overlay" onClick={onClose}>
      <div className="mc-modal-panel w-[520px]" onClick={(e) => e.stopPropagation()}>
        <h3 className="mt-0 mb-5 text-xl border-b border-zinc-700 pb-2.5">
          {t('serverSettings.versionUpgrade.title')}
        </h3>

        {/* Step: check */}
        {step === 'check' && (
          <div>
            <div className="server-settings__row mb-4">
              <div className="server-settings__col">
                <label className="server-settings__label">
                  {t('serverSettings.versionUpgrade.currentVersion')}
                </label>
                <span>{server.version}</span>
              </div>
              <div className="server-settings__col">
                <label className="server-settings__label">
                  {t('serverSettings.versionUpgrade.latestVersion')}
                </label>
                <span>{latestVersion ?? t('serverSettings.versionUpgrade.fetching')}</span>
              </div>
            </div>

            {unsupported && (
              <p className="text-red-400">{t('serverSettings.versionUpgrade.unsupported')}</p>
            )}

            {!unsupported && isLatest && <p>{t('serverSettings.versionUpgrade.alreadyLatest')}</p>}

            {!unsupported && !isOffline && (
              <p className="text-red-400">
                {t('serverSettings.versionUpgrade.serverMustBeOffline')}
              </p>
            )}

            <div className="flex justify-end gap-2.5 mt-2.5">
              <Button variant="modalSecondary" onClick={onClose}>
                {t('serverSettings.versionUpgrade.close')}
              </Button>
              {!unsupported && !isLatest && isOffline && latestVersion !== null && (
                <Button variant="modalPrimary" onClick={() => setStep('backup')}>
                  {t('serverSettings.versionUpgrade.startUpgrade')}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step: backup */}
        {step === 'backup' && (
          <div>
            <p>{t('serverSettings.versionUpgrade.backupDescription')}</p>
            {backupProgress > 0 && (
              <div className="my-3">
                <div className="h-1.5 rounded bg-[#3e3e42]">
                  <div
                    style={{ width: `${backupProgress}%` }}
                    className="h-full rounded bg-[#5865F2] transition-[width] duration-200"
                  />
                </div>
                <span className="mt-1 block text-xs text-[#9ca3af]">{backupProgress}%</span>
              </div>
            )}
            <div className="flex justify-end gap-2.5 mt-2.5">
              <Button
                variant="modalPrimary"
                onClick={() => {
                  void handleBackup();
                }}
                disabled={processing}
              >
                {t('serverSettings.versionUpgrade.runBackup')}
              </Button>
            </div>
          </div>
        )}

        {/* Step: download */}
        {step === 'download' && (
          <div>
            <p>{t('serverSettings.versionUpgrade.downloadDescription')}</p>
            {dlProgress > 0 && (
              <div className="my-3">
                <div className="h-1.5 rounded bg-[#3e3e42]">
                  <div
                    style={{ width: `${dlProgress}%` }}
                    className="h-full rounded bg-[#5865F2] transition-[width] duration-200"
                  />
                </div>
                <span className="mt-1 block text-xs text-[#9ca3af]">{dlProgress}%</span>
              </div>
            )}
            <div className="flex justify-end gap-2.5 mt-2.5">
              <Button variant="modalSecondary" onClick={onClose} disabled={processing}>
                {t('serverSettings.versionUpgrade.close')}
              </Button>
              <Button
                variant="modalPrimary"
                onClick={() => {
                  void handleDownload();
                }}
                disabled={processing || !preparedPlanId || !verified}
              >
                {t('serverSettings.versionUpgrade.runDownload')}
              </Button>
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div>
            <p>{t('serverSettings.versionUpgrade.doneDescription')}</p>
            <div className="flex justify-end gap-2.5 mt-2.5">
              <Button variant="modalPrimary" onClick={onClose}>
                {t('serverSettings.versionUpgrade.close')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
