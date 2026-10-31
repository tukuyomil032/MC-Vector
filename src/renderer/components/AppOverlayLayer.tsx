import type { Translate } from '../../i18n';
import type { ServerTemplate } from '../../lib/server-commands';
import type { UpdatePromptState } from '../hooks/use-app-updater';
import type { PendingServerEula } from '../hooks/use-server-eula-gate';
import AddServerModal from './AddServerModal';
import AppUpdateModal from './AppUpdateModal';
import ImportServerModal from './ImportServerModal';
import ServerEulaModal from './ServerEulaModal';

interface AppOverlayLayerProps {
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
  updateModalOpen: boolean;
  onDismissUpdate: () => void;
  onUpdateNow: () => void;
  onInstallUpdate: () => void;
  onSkipUpdateVersion: () => void;
  pendingEula: PendingServerEula | null;
  onAcceptEula: () => Promise<boolean>;
  onCancelEula: () => void;
  t: Translate;
}

export default function AppOverlayLayer({
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
  updateModalOpen,
  onDismissUpdate,
  onUpdateNow,
  onInstallUpdate,
  onSkipUpdateVersion,
  pendingEula,
  onAcceptEula,
  onCancelEula,
  t,
}: AppOverlayLayerProps) {
  return (
    <>
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
        open={updateModalOpen}
        updatePrompt={updatePrompt}
        updateProgress={updateProgress}
        updateError={updateError}
        updateReady={updateReady}
        t={t}
        onDismiss={onDismissUpdate}
        onUpdateNow={onUpdateNow}
        onInstall={onInstallUpdate}
        onSkipVersion={onSkipUpdateVersion}
      />
      <ServerEulaModal pending={pendingEula} onAccept={onAcceptEula} onCancel={onCancelEula} />
    </>
  );
}
