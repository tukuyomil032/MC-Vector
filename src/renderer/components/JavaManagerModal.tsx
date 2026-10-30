import { cn } from '@/lib/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { ask } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import { copyToClipboard } from '../../lib/clipboard-commands';
import { logError } from '../../lib/error-utils';
import {
  type JavaVersion,
  deleteJava,
  downloadJava,
  getJavaVersions,
  onJavaDownloadProgress,
  selectJavaBinary,
} from '../../lib/java-commands';
import { notify } from '../shared/notify';
import { Button } from './ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function JavaManagerModal({ open: isOpen, onClose }: Props) {
  const [installed, setInstalled] = useState<JavaVersion[]>([]);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const availableVersions = [8, 17, 21];
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
        notify.success(t('javaManager.toast.downloadSuccess', { version: ver }));
      } else {
        notify.error(t('javaManager.toast.downloadFailed'));
      }
    } catch (error) {
      logError('Java download failed', error, { version: ver });
      notify.error(t('javaManager.toast.downloadFailed'));
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
    if (!confirmed) {
      return;
    }
    try {
      await deleteJava(ver);
      await loadInstalled();
      notify.info(t('javaManager.toast.removed', { version: ver }));
    } catch (error) {
      console.error(error);
      notify.error(t('javaManager.toast.removeFailed', { version: ver }));
    }
  };

  const isDownloading = downloading !== null;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="java-manager-modal-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="java-manager-dialog"
          className={cn(
            'java-manager-modal-panel',
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1001]',
          )}
          onEscapeKeyDown={isDownloading ? (e) => e.preventDefault() : undefined}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className="java-manager-modal__header">
            <Dialog.Title className="m-0">{t('javaManager.title')}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="java-manager-modal__close-button">×</button>
            </Dialog.Close>
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
                      <div className="text-success font-bold" data-testid={`java-installed-${v}`}>
                        {t('javaManager.installed')}
                      </div>
                    ) : (
                      <Button
                        variant="primary"
                        className="java-manager-modal__download-btn"
                        data-testid={`java-download-${v}`}
                        onClick={() => handleDownload(v)}
                        disabled={isDownloading}
                      >
                        {downloading === v
                          ? t('javaManager.downloading', { progress: downloadProgress ?? '' })
                          : t('javaManager.download')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            {isDownloading && (
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
            <Button
              variant="secondary"
              onClick={async () => {
                const picked = await selectJavaBinary();
                if (picked) {
                  try {
                    await copyToClipboard(picked);
                    notify.success(t('javaManager.toast.pathCopied'));
                  } catch {
                    notify.info(t('javaManager.toast.pathInfo', { path: picked }));
                  }
                } else {
                  notify.info(t('javaManager.toast.selectionCancelled'));
                }
              }}
            >
              {t('javaManager.manualSelect.button')}
            </Button>
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
                    <Button
                      variant="stop"
                      className="java-manager-modal__delete-btn"
                      onClick={() => handleDelete(java.version)}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
