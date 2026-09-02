import { cn } from '@/lib/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from '../../i18n';
import { cancelServerImport, pickServerImport } from '../../lib/server-import-commands';

interface ImportServerModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (serverData: unknown) => void;
}

export default function ImportServerModal({
  open: isOpen,
  onClose,
  onAdd,
}: ImportServerModalProps) {
  const { t } = useTranslation();
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (type === 'success') {
      toast.success(msg);
    } else if (type === 'error') {
      toast.error(msg);
    } else {
      toast(msg);
    }
  };

  const [folderPath, setFolderPath] = useState('');
  const [serverName, setServerName] = useState('');
  const [version, setVersion] = useState('');
  const [software, setSoftware] = useState('Paper');
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [hasServerJar, setHasServerJar] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [importToken, setImportToken] = useState<string | null>(null);
  const hasSubmitted = useRef(false);

  useEffect(() => {
    if (isOpen) {
      hasSubmitted.current = false;
    }
  }, [isOpen]);

  const handleSelectFolder = async () => {
    setIsAnalyzing(true);
    try {
      if (importToken) {
        await cancelServerImport(importToken);
      }
      const analysis = await pickServerImport();
      if (!analysis) {
        return;
      }
      if (!analysis.hasServerJar) {
        await cancelServerImport(analysis.token);
        showToast(t('importServer.toast.noJar'), 'error');
        return;
      }
      setImportToken(analysis.token);
      setFolderPath(analysis.folderName);
      setHasServerJar(analysis.hasServerJar);
      setEulaAccepted(analysis.eulaAccepted);
      setVersion(analysis.detectedVersion);
      setSoftware(analysis.detectedSoftware);
      setServerName(analysis.folderName);
      setAnalyzed(true);
    } catch {
      showToast(t('importServer.toast.failed'), 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImport = () => {
    if (!importToken || !serverName) {
      return;
    }
    hasSubmitted.current = true;
    onAdd({
      name: serverName,
      version,
      software,
      port: 25565,
      memory: 4,
      importToken,
    });
    showToast(t('importServer.toast.success'), 'success');
    onClose();
  };

  const handleCancel = () => {
    if (!hasSubmitted.current && importToken) {
      void cancelServerImport(importToken).catch(() => undefined);
    }
    setImportToken(null);
    onClose();
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) handleCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="mc-modal-overlay" />
        <Dialog.Content
          data-testid="import-server-modal"
          aria-describedby={undefined}
          className={cn(
            'mc-modal-panel',
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1001]',
          )}
          style={{ minWidth: 420 }}
        >
          <Dialog.Title className="mc-modal-title">{t('importServer.title')}</Dialog.Title>

          <label className="mc-modal-label">{t('importServer.folderLabel')}</label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              readOnly
              value={folderPath}
              placeholder={t('importServer.folderPlaceholder')}
              className="mc-modal-input flex-1"
            />
            <button
              type="button"
              className="btn-secondary"
              data-testid="import-select-folder-button"
              onClick={handleSelectFolder}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? '...' : t('importServer.selectButton')}
            </button>
          </div>

          {analyzed && hasServerJar && (
            <>
              {!eulaAccepted && (
                <p className="text-yellow-400 text-sm mb-3">{t('importServer.eulaWarning')}</p>
              )}

              <label className="mc-modal-label">{t('importServer.nameLabel')}</label>
              <input
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                className="mc-modal-input mb-3"
              />

              <label className="mc-modal-label">{t('importServer.versionLabel')}</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="mc-modal-input mb-3"
              />

              <label className="mc-modal-label">{t('importServer.softwareLabel')}</label>
              <input
                type="text"
                value={software}
                onChange={(e) => setSoftware(e.target.value)}
                className="mc-modal-input mb-3"
              />
            </>
          )}

          <div className="mc-modal-footer">
            <Dialog.Close asChild>
              <button type="button" className="mc-modal-btn-secondary" onClick={handleCancel}>
                {t('common.cancel')}
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="mc-modal-btn-primary"
              data-testid="import-server-submit"
              onClick={handleImport}
              disabled={!analyzed || !hasServerJar || !serverName}
            >
              {t('importServer.importButton')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
