import { cn } from '@/lib/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from '../../i18n';
import { cancelServerImport, pickServerImport } from '../../lib/server-import-commands';
import { Button } from './ui/Button';
import { Input } from './ui/Field';

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
            'mc-modal-panel min-w-[420px]',
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1001]',
          )}
        >
          <Dialog.Title className="mt-0 mb-5 text-xl border-b border-zinc-700 pb-2.5">
            {t('importServer.title')}
          </Dialog.Title>

          <label>{t('importServer.folderLabel')}</label>
          <div className="flex gap-2 mb-3">
            <Input
              type="text"
              readOnly
              value={folderPath}
              placeholder={t('importServer.folderPlaceholder')}
              variant="modal"
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              data-testid="import-select-folder-button"
              onClick={handleSelectFolder}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? '...' : t('importServer.selectButton')}
            </Button>
          </div>

          {analyzed && hasServerJar && (
            <>
              {!eulaAccepted && (
                <p className="text-yellow-400 text-sm mb-3">{t('importServer.eulaWarning')}</p>
              )}

              <label>{t('importServer.nameLabel')}</label>
              <Input
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                variant="modal"
                className="mb-3"
              />

              <label>{t('importServer.versionLabel')}</label>
              <Input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                variant="modal"
                className="mb-3"
              />

              <label>{t('importServer.softwareLabel')}</label>
              <Input
                type="text"
                value={software}
                onChange={(e) => setSoftware(e.target.value)}
                variant="modal"
                className="mb-3"
              />
            </>
          )}

          <div className="flex justify-end gap-2.5 mt-2.5">
            <Dialog.Close asChild>
              <Button type="button" variant="modalSecondary" onClick={handleCancel}>
                {t('common.cancel')}
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              variant="modalPrimary"
              data-testid="import-server-submit"
              onClick={handleImport}
              disabled={!analyzed || !hasServerJar || !serverName}
            >
              {t('importServer.importButton')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
