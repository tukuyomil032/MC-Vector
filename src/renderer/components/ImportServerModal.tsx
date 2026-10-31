import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Input } from '@/components/arc/input/input';
import { NumberField } from '@/components/arc/number-field/number-field';
import { Select } from '@/components/arc/select/select';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import { useArcMessages } from '../shared/arc-messages';
import { cancelServerImport, pickServerImport } from '../../lib/server-import-commands';
import { notify } from '../shared/notify';
import styles from './ImportServerModal.module.css';
import { softwareSelectOptions } from './serverSoftwareOptions';

const DEFAULT_PORT = 25565;
const DEFAULT_MEMORY_GB = 4;

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
  const arc = useArcMessages();
  const [folderPath, setFolderPath] = useState('');
  const [serverName, setServerName] = useState('');
  const [version, setVersion] = useState('');
  const [software, setSoftware] = useState('Paper');
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [noJar, setNoJar] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [importToken, setImportToken] = useState<string | null>(null);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [memory, setMemory] = useState(DEFAULT_MEMORY_GB);
  const hasSubmitted = useRef(false);

  useEffect(() => {
    if (isOpen) {
      hasSubmitted.current = false;
    }
  }, [isOpen]);

  const resetForm = () => {
    setFolderPath('');
    setServerName('');
    setVersion('');
    setSoftware('Paper');
    setEulaAccepted(false);
    setAnalyzed(false);
    setNoJar(false);
    setIsAnalyzing(false);
    setImportToken(null);
    setPort(DEFAULT_PORT);
    setMemory(DEFAULT_MEMORY_GB);
  };

  const handleSelectFolder = async () => {
    setNoJar(false);
    setIsAnalyzing(true);
    try {
      const analysis = await pickServerImport();
      // Cancelling the native picker returns null; the current analysis stays as it was.
      if (!analysis) {
        return;
      }
      // A new pick supersedes the previous staged folder, so its token is released.
      if (importToken) {
        void cancelServerImport(importToken).catch(() => undefined);
      }
      setImportToken(null);
      setAnalyzed(false);
      setFolderPath(analysis.folderName);
      if (!analysis.hasServerJar) {
        await cancelServerImport(analysis.token);
        setNoJar(true);
        return;
      }
      setImportToken(analysis.token);
      setEulaAccepted(analysis.eulaAccepted);
      setVersion(analysis.detectedVersion);
      setSoftware(analysis.detectedSoftware);
      setServerName(analysis.folderName);
      setAnalyzed(true);
    } catch {
      notify.error(t('importServer.toast.failed'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const portValid = Number.isInteger(port) && port >= 1 && port <= 65535;
  const memoryValid = Number.isInteger(memory) && memory >= 1;
  const ready =
    analyzed && importToken !== null && serverName.trim() !== '' && portValid && memoryValid;

  const handleImport = () => {
    if (!ready || !importToken) {
      return;
    }
    hasSubmitted.current = true;
    onAdd({
      name: serverName,
      version,
      software,
      port,
      memory,
      importToken,
    });
    notify.success(t('importServer.toast.success'));
    resetForm();
    onClose();
  };

  const handleClose = () => {
    if (!hasSubmitted.current && importToken) {
      void cancelServerImport(importToken).catch(() => undefined);
    }
    resetForm();
    onClose();
  };

  const softwareOptions = softwareSelectOptions(t);

  const footer = (
    <>
      <Button
        type="button"
        variant="secondary"
        data-testid="import-cancel-button"
        onClick={handleClose}
      >
        {t('common.cancel')}
      </Button>
      <Button
        type="button"
        variant="primary"
        data-testid="import-server-submit"
        disabled={!ready}
        onClick={handleImport}
      >
        {t('importServer.importButton')}
      </Button>
    </>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent
        data-testid="import-server-modal"
        aria-describedby={undefined}
        title={t('importServer.title')}
        width="min(520px, calc(100vw - var(--space-8)))"
        footer={footer}
      >
        <div className={styles.form}>
          <div className={styles.folderRow}>
            <Input
              label={t('importServer.folderLabel')}
              readOnly
              value={folderPath}
              placeholder={t('importServer.folderPlaceholder')}
            />
            <Button
              type="button"
              variant="secondary"
              data-testid="import-select-folder-button"
              loading={isAnalyzing}
              onClick={handleSelectFolder}
            >
              {t('importServer.selectButton')}
            </Button>
          </div>

          {noJar && (
            <Alert tone="danger" title={t('importServer.noJarTitle')}>
              {t('importServer.noJarBody')}
            </Alert>
          )}

          {isAnalyzing && <Skeleton label={t('importServer.analyzing')} lines={3} />}

          {!analyzed && !isAnalyzing && !noJar && (
            <p className={styles.hint}>{t('importServer.folderHint')}</p>
          )}

          {analyzed && !isAnalyzing && (
            <>
              {!eulaAccepted && (
                <Alert tone="warning" title={t('importServer.eulaTitle')}>
                  {t('importServer.eulaWarning')}
                </Alert>
              )}

              <Input
                label={t('importServer.nameLabel')}
                data-testid="import-name-input"
                value={serverName}
                onChange={(event) => setServerName(event.target.value)}
              />

              <div className={styles.row}>
                <Input
                  label={t('importServer.versionLabel')}
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                />
                <Select
                  label={t('importServer.softwareLabel')}
                  placeholder={arc.select.placeholder}
                  testId="import-software-select"
                  options={softwareOptions}
                  value={software}
                  onValueChange={setSoftware}
                />
              </div>

              <div className={styles.row}>
                <NumberField
                  label={t('addServer.port.label')}
                  testId="import-port-input"
                  value={port}
                  onValueChange={setPort}
                  min={1}
                  max={65535}
                  formatOptions={{ useGrouping: false }}
                  error={portValid ? undefined : t('addServer.port.invalid')}
                />
                <NumberField
                  label={t('addServer.memory.label')}
                  testId="import-memory-input"
                  value={memory}
                  onValueChange={setMemory}
                  min={1}
                  suffix="GB"
                  error={memoryValid ? undefined : t('addServer.memory.invalid')}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
