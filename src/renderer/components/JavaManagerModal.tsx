import { ask } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import {
  deleteJava,
  downloadJava,
  getJavaVersions,
  type JavaVersion,
  onJavaDownloadProgress,
  selectJavaBinary,
} from '../../lib/java-commands';
import { useToast } from './ToastProvider';

interface Props {
  onClose: () => void;
}

export default function JavaManagerModal({ onClose }: Props) {
  const [installed, setInstalled] = useState<JavaVersion[]>([]);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const availableVersions = [8, 17, 21];
  const { showToast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    loadInstalled();

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void onJavaDownloadProgress((data) => {
      setDownloadProgress(typeof data.progress === 'number' ? data.progress : null);
    }).then((u) => {
      if (cancelled) {
        u();
        return;
      }
      unlisten = u;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const loadInstalled = async () => {
    const list = await getJavaVersions();
    setInstalled(list);
  };

  const handleDownload = async (ver: number) => {
    setDownloading(ver);
    setDownloadProgress(0);
    setDownloadStatus('');
    try {
      const ok = await downloadJava(ver);
      await loadInstalled();
      if (ok) {
        showToast(t('javaManager.toast.downloadSuccess', { version: ver }), 'success');
      } else {
        showToast(t('javaManager.toast.downloadFailed'), 'error');
      }
    } catch {
      showToast(t('javaManager.toast.downloadFailed'), 'error');
    } finally {
      setDownloading(null);
      setDownloadProgress(null);
      setDownloadStatus('');
    }
  };

  const handleDelete = async (ver: number) => {
    const confirmed = await ask(t('javaManager.confirm.uninstall', { version: ver }), {
      title: t('javaManager.confirm.deleteTitle'),
      kind: 'warning',
    });
    if (!confirmed) return;
    await deleteJava(ver);
    loadInstalled();
    showToast(t('javaManager.toast.removed', { version: ver }), 'info');
  };

  return (
    <div className="java-manager-modal-overlay modal-backdrop" onClick={onClose}>
      <div className="java-manager-modal-panel modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="java-manager-modal__header">
          <h2 className="m-0">{t('javaManager.title')}</h2>
          <button onClick={onClose} className="java-manager-modal__close-button">
            ×
          </button>
        </div>

        <div className="java-manager-modal__available-section">
          <h3 className="java-manager-modal__section-title">
            {t('javaManager.availableVersions')}
          </h3>
          <div className="java-manager-modal__version-grid">
            {availableVersions.map((v) => {
              const isInstalled = installed.some((i) => i.version === v);
              return (
                <div key={v} className="java-manager-modal__version-card">
                  <div className="java-manager-modal__version-title">Java {v}</div>
                  {isInstalled ? (
                    <div className="text-success font-bold">{t('javaManager.installed')}</div>
                  ) : (
                    <button
                      className="btn-primary java-manager-modal__download-btn disabled:opacity-50"
                      onClick={() => handleDownload(v)}
                      disabled={downloading !== null}
                    >
                      {downloading === v
                        ? t('javaManager.downloading', { progress: downloadProgress ?? '' })
                        : t('javaManager.download')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {downloading !== null && (
            <div className="java-manager-modal__download-status">
              {downloadStatus || t('javaManager.downloadingStatus')}
            </div>
          )}
        </div>

        <div className="java-manager-modal__manual-section">
          <div className="java-manager-modal__manual-copy">
            <h3 className="java-manager-modal__section-title java-manager-modal__section-title--compact">
              {t('javaManager.manualSelect.title')}
            </h3>
            <p className="java-manager-modal__manual-note">
              {t('javaManager.manualSelect.description')}
            </p>
          </div>
          <button
            className="btn-secondary"
            onClick={async () => {
              const picked = await selectJavaBinary();
              if (picked) {
                try {
                  await navigator.clipboard.writeText(picked);
                  showToast(t('javaManager.toast.pathCopied'), 'success');
                } catch {
                  showToast(t('javaManager.toast.pathInfo', { path: picked }), 'info');
                }
              } else {
                showToast(t('javaManager.toast.selectionCancelled'), 'info');
              }
            }}
          >
            {t('javaManager.manualSelect.button')}
          </button>
        </div>

        <div className="java-manager-modal__installed-section">
          <h3 className="java-manager-modal__section-title">
            {t('javaManager.installedRuntimes')}
          </h3>
          {installed.length === 0 ? (
            <div className="java-manager-modal__empty">{t('javaManager.noRuntimes')}</div>
          ) : (
            <div className="java-manager-modal__runtime-list">
              {installed.map((java) => (
                <div key={java.path} className="java-manager-modal__runtime-row">
                  <div>
                    <div className="java-manager-modal__runtime-name">{java.name}</div>
                    <div className="java-manager-modal__runtime-path">{java.path}</div>
                  </div>
                  <button
                    className="btn-stop java-manager-modal__delete-btn"
                    onClick={() => handleDelete(java.version)}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
