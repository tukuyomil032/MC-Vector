import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/ui';
import { open } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { useTranslation } from '../../i18n';
import { analyzeServerFolder } from '../../lib/server-import-commands';
import { useToast } from './ToastProvider';

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
  const { showToast } = useToast();

  const [folderPath, setFolderPath] = useState('');
  const [serverName, setServerName] = useState('');
  const [version, setVersion] = useState('');
  const [software, setSoftware] = useState('Paper');
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [hasServerJar, setHasServerJar] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSelectFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;

    setIsAnalyzing(true);
    try {
      const analysis = await analyzeServerFolder(selected);
      if (!analysis.hasServerJar) {
        showToast(t('importServer.toast.noJar'), 'error');
        setIsAnalyzing(false);
        return;
      }
      setFolderPath(selected);
      setHasServerJar(analysis.hasServerJar);
      setEulaAccepted(analysis.eulaAccepted);
      setVersion(analysis.detectedVersion);
      setSoftware(analysis.detectedSoftware);
      const folderName = selected.replace(/\\/g, '/').split('/').at(-1) ?? 'imported-server';
      setServerName(folderName);
      setAnalyzed(true);
    } catch {
      showToast(t('importServer.toast.failed'), 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImport = () => {
    if (!folderPath || !serverName) return;
    onAdd({
      name: serverName,
      version,
      software,
      port: 25565,
      memory: 4,
      path: folderPath,
    });
    showToast(t('importServer.toast.success'), 'success');
    onClose();
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="mc-modal-overlay" />
        <Dialog.Content
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
              <button type="button" className="mc-modal-btn-secondary">
                {t('common.cancel')}
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="mc-modal-btn-primary"
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
