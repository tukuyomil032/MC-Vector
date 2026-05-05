import { useEffect, useState } from 'react';
import { onBackupProgress, createBackup } from '../../lib/backup-commands';
import { downloadServerJar, onDownloadProgress, updateServer } from '../../lib/server-commands';
import { resolveLatestJarUrl } from '../../lib/version-commands';
import { useTranslation } from '../../i18n';
import type { UnlistenFn } from '../../lib/tauri-api';
import type { MinecraftServer } from '../shared/server declaration';
import { useToast } from './ToastProvider';

type WizardStep = 'check' | 'backup' | 'download' | 'done';

interface Props {
  server: MinecraftServer;
  onClose: () => void;
  onServerUpdate: (updated: MinecraftServer) => Promise<void>;
}

export default function VersionUpgradeWizard({ server, onClose, onServerUpdate }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [step, setStep] = useState<WizardStep>('check');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [backupProgress, setBackupProgress] = useState(0);
  const [dlProgress, setDlProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  // Step 1: fetch latest version on mount
  useEffect(() => {
    let cancelled = false;
    resolveLatestJarUrl(server.software ?? '', server.version).then((result) => {
      if (cancelled) return;
      if (result === null) {
        setUnsupported(true);
      } else {
        setLatestVersion(result.latestVersion);
        setDownloadUrl(result.downloadUrl);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [server.software, server.version]);

  const isOffline = server.status === 'offline';
  const isLatest = latestVersion !== null && latestVersion === server.version;

  // Step 2: backup
  const handleBackup = async () => {
    setProcessing(true);
    setBackupProgress(0);
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await onBackupProgress(({ serverId, progress }) => {
        if (serverId === server.id) setBackupProgress(Math.round(progress * 100));
      });
      const backupName = `pre-upgrade-${Date.now()}`;
      await createBackup(server.path, backupName);
      setStep('download');
    } catch {
      showToast('バックアップに失敗しました', 'error');
    } finally {
      unlisten?.();
      setProcessing(false);
    }
  };

  // Step 3: download
  const handleDownload = async () => {
    if (!downloadUrl || !latestVersion) return;
    setProcessing(true);
    setDlProgress(0);
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await onDownloadProgress(({ serverId, progress }) => {
        if (serverId === server.id) setDlProgress(Math.round(progress));
      });
      await downloadServerJar(downloadUrl, `${server.path}/server.jar`, server.id);
      const updated: MinecraftServer = { ...server, version: latestVersion };
      await updateServer(updated);
      await onServerUpdate(updated);
      setStep('done');
    } catch {
      showToast('ダウンロードに失敗しました', 'error');
    } finally {
      unlisten?.();
      setProcessing(false);
    }
  };

  return (
    <div className="mc-modal-overlay" onClick={onClose}>
      <div className="mc-modal-panel" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="mc-modal-title">{t('serverSettings.versionUpgrade.title')}</h3>

        {/* Step: check */}
        {step === 'check' && (
          <div>
            <div className="server-settings__row" style={{ marginBottom: 16 }}>
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
              <p style={{ color: '#f87171' }}>{t('serverSettings.versionUpgrade.unsupported')}</p>
            )}

            {!unsupported && isLatest && <p>{t('serverSettings.versionUpgrade.alreadyLatest')}</p>}

            {!unsupported && !isOffline && (
              <p style={{ color: '#f87171' }}>
                {t('serverSettings.versionUpgrade.serverMustBeOffline')}
              </p>
            )}

            <div className="mc-modal-footer">
              <button className="mc-modal-btn-secondary" onClick={onClose}>
                {t('serverSettings.versionUpgrade.close')}
              </button>
              {!unsupported && !isLatest && isOffline && latestVersion !== null && (
                <button className="mc-modal-btn-primary" onClick={() => setStep('backup')}>
                  {t('serverSettings.versionUpgrade.startUpgrade')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step: backup */}
        {step === 'backup' && (
          <div>
            <p>{t('serverSettings.versionUpgrade.backupDescription')}</p>
            {backupProgress > 0 && (
              <div style={{ margin: '12px 0' }}>
                <div style={{ background: '#3e3e42', borderRadius: 4, height: 6 }}>
                  <div
                    style={{
                      background: '#5865F2',
                      width: `${backupProgress}%`,
                      height: '100%',
                      borderRadius: 4,
                      transition: 'width 0.2s',
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, display: 'block' }}>
                  {backupProgress}%
                </span>
              </div>
            )}
            <div className="mc-modal-footer">
              <button className="mc-modal-btn-secondary" onClick={onClose} disabled={processing}>
                {t('serverSettings.versionUpgrade.close')}
              </button>
              <button
                className="mc-modal-btn-primary"
                onClick={() => {
                  void handleBackup();
                }}
                disabled={processing}
              >
                {t('serverSettings.versionUpgrade.runBackup')}
              </button>
            </div>
          </div>
        )}

        {/* Step: download */}
        {step === 'download' && (
          <div>
            <p>{t('serverSettings.versionUpgrade.downloadDescription')}</p>
            {dlProgress > 0 && (
              <div style={{ margin: '12px 0' }}>
                <div style={{ background: '#3e3e42', borderRadius: 4, height: 6 }}>
                  <div
                    style={{
                      background: '#5865F2',
                      width: `${dlProgress}%`,
                      height: '100%',
                      borderRadius: 4,
                      transition: 'width 0.2s',
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, display: 'block' }}>
                  {dlProgress}%
                </span>
              </div>
            )}
            <div className="mc-modal-footer">
              <button className="mc-modal-btn-secondary" onClick={onClose} disabled={processing}>
                {t('serverSettings.versionUpgrade.close')}
              </button>
              <button
                className="mc-modal-btn-primary"
                onClick={() => {
                  void handleDownload();
                }}
                disabled={processing || !downloadUrl}
              >
                {t('serverSettings.versionUpgrade.runDownload')}
              </button>
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div>
            <p>{t('serverSettings.versionUpgrade.doneDescription')}</p>
            <div className="mc-modal-footer">
              <button className="mc-modal-btn-primary" onClick={onClose}>
                {t('serverSettings.versionUpgrade.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
