import type { Translate } from '../../i18n';
import type { ServerTemplate } from '../../lib/server-commands';
import type { UpdatePromptState } from '../hooks/use-app-updater';
import AddServerModal from './AddServerModal';
import AppDownloadToast from './AppDownloadToast';
import AppUpdateModal from './AppUpdateModal';
import ImportServerModal from './ImportServerModal';

interface DownloadStatus {
  id: string;
  progress: number;
  msg: string;
}

interface AppOverlayLayerProps {
  downloadStatus: DownloadStatus | null;
  showAddServerModal: boolean;
  onCloseAddServerModal: () => void;
  onAddServer: (serverData: unknown) => void;
  serverTemplates: ServerTemplate[];
  showImportServerModal: boolean;
  onCloseImportServerModal: () => void;
  updatePrompt: UpdatePromptState | null;
  updateProgress: number | null;
  updateError: string | null;
  updateReady: boolean;
  onDismissUpdate: () => void;
  onUpdateNow: () => void;
  onInstallUpdate: () => void;
  t: Translate;
}

export default function AppOverlayLayer({
  downloadStatus,
  showAddServerModal,
  onCloseAddServerModal,
  onAddServer,
  serverTemplates,
  showImportServerModal,
  onCloseImportServerModal,
  updatePrompt,
  updateProgress,
  updateError,
  updateReady,
  onDismissUpdate,
  onUpdateNow,
  onInstallUpdate,
  t,
}: AppOverlayLayerProps) {
  return (
    <>
      {downloadStatus && (
        <AppDownloadToast
          title={t('common.downloading')}
          progress={downloadStatus.progress}
          message={downloadStatus.msg}
        />
      )}
      <AddServerModal
        open={showAddServerModal}
        onClose={onCloseAddServerModal}
        onAdd={onAddServer}
        templates={serverTemplates}
      />
      <ImportServerModal
        open={showImportServerModal}
        onClose={onCloseImportServerModal}
        onAdd={onAddServer}
      />
      <AppUpdateModal
        updatePrompt={updatePrompt}
        updateProgress={updateProgress}
        updateError={updateError}
        updateReady={updateReady}
        t={t}
        onDismiss={onDismissUpdate}
        onUpdateNow={onUpdateNow}
        onInstall={onInstallUpdate}
      />
    </>
  );
}
