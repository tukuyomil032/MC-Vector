import type { ServerTemplate } from '../../lib/server-commands';
import type { ServerContextMenuState } from '../../store/uiStore';
import type { Translate } from '../../i18n';
import type { UpdatePromptState } from '../hooks/use-app-updater';
import AddServerModal from './AddServerModal';
import AppContextMenu from './AppContextMenu';
import AppDownloadToast from './AppDownloadToast';
import AppUpdateModal from './AppUpdateModal';

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
  contextMenu: ServerContextMenuState | null;
  onDuplicateServer: () => Promise<void>;
  onSaveServerTemplate: () => Promise<void>;
  onDeleteServer: () => Promise<void>;
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
  contextMenu,
  onDuplicateServer,
  onSaveServerTemplate,
  onDeleteServer,
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
      {showAddServerModal && (
        <AddServerModal
          onClose={onCloseAddServerModal}
          onAdd={onAddServer}
          templates={serverTemplates}
        />
      )}
      <AppContextMenu
        contextMenu={contextMenu}
        onDuplicateServer={onDuplicateServer}
        onSaveServerTemplate={onSaveServerTemplate}
        onDeleteServer={onDeleteServer}
        cloneLabel={t('server.actions.clone')}
        saveTemplateLabel={t('server.actions.saveTemplate')}
        deleteLabel={t('common.delete')}
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
