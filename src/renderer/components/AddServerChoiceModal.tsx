import { useTranslation } from '../../i18n';

interface AddServerChoiceModalProps {
  onClose: () => void;
  onNewServer: () => void;
  onImportServer: () => void;
}

export default function AddServerChoiceModal({
  onClose,
  onNewServer,
  onImportServer,
}: AddServerChoiceModalProps) {
  const { t } = useTranslation();

  return (
    <div className="mc-modal-overlay" onClick={onClose}>
      <div className="mc-modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="mc-modal-title">{t('addServer.choice.title')}</h2>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="flex flex-col items-start gap-1 p-4 rounded-lg border border-zinc-700 bg-transparent text-left hover:bg-zinc-800 transition-colors"
            onClick={() => {
              onClose();
              onNewServer();
            }}
          >
            <span className="text-white font-semibold">{t('addServer.choice.newServer')}</span>
            <span className="text-zinc-400 text-sm">{t('addServer.choice.newServerHint')}</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-start gap-1 p-4 rounded-lg border border-zinc-700 bg-transparent text-left hover:bg-zinc-800 transition-colors"
            onClick={() => {
              onClose();
              onImportServer();
            }}
          >
            <span className="text-white font-semibold">{t('addServer.choice.importServer')}</span>
            <span className="text-zinc-400 text-sm">{t('addServer.choice.importServerHint')}</span>
          </button>
        </div>
        <div className="mc-modal-footer">
          <button type="button" className="mc-modal-btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
