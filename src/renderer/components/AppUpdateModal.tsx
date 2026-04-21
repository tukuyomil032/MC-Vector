import type { Translate } from '../../i18n';

interface UpdatePromptState {
  version?: string;
  releaseNotes?: unknown;
}

interface AppUpdateModalProps {
  updatePrompt: UpdatePromptState | null;
  updateProgress: number | null;
  updateError: string | null;
  updateReady: boolean;
  t: Translate;
  onDismiss: () => void;
  onUpdateNow: () => void;
  onInstall: () => void;
}

function getReleaseNotesText(releaseNotes: unknown): string {
  if (!releaseNotes) {
    return '';
  }
  if (typeof releaseNotes === 'string') {
    return releaseNotes;
  }
  if (!Array.isArray(releaseNotes)) {
    return '';
  }
  return releaseNotes
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (
        entry &&
        typeof entry === 'object' &&
        'body' in entry &&
        typeof (entry as Record<string, unknown>).body === 'string'
      ) {
        return (entry as Record<string, unknown>).body as string;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

export default function AppUpdateModal({
  updatePrompt,
  updateProgress,
  updateError,
  updateReady,
  t,
  onDismiss,
  onUpdateNow,
  onInstall,
}: AppUpdateModalProps) {
  if (!updatePrompt && !updateError) {
    return null;
  }

  const releaseNotesText = getReleaseNotesText(updatePrompt?.releaseNotes);

  return (
    <div className="app-update-overlay">
      <div className="app-update-modal">
        <h3 className="app-update-modal__title">
          {updatePrompt
            ? t('settings.update.available', { version: updatePrompt.version || '?' })
            : t('settings.update.title')}
        </h3>

        {releaseNotesText && updatePrompt && (
          <div className="mb-4">
            <div className="app-update-modal__notes-label">{t('settings.update.releaseNotes')}</div>
            <pre className="app-update-modal__notes">{releaseNotesText}</pre>
          </div>
        )}

        {updateError && (
          <div className="mb-4 text-sm text-red-400">{t('settings.update.error', { message: updateError })}</div>
        )}

        {updatePrompt && updateProgress !== null && !updateReady && (
          <div className="mb-4">
            <div className="app-update-modal__progress-label">
              {t('settings.update.downloading', { progress: Math.round(updateProgress) })}
            </div>
            <div className="app-update-modal__progress-track">
              <div
                className="app-update-modal__progress-bar"
                style={{
                  width: `${Math.min(100, Math.round(updateProgress))}%`,
                }}
              />
            </div>
          </div>
        )}

        {updatePrompt && updateReady && (
          <div className="mb-4 text-sm text-green-400">{t('settings.update.downloaded')}</div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onDismiss}>
            {t('common.cancel')}
          </button>
          {updatePrompt && !updateReady && (
            <button
              className="btn-primary"
              onClick={onUpdateNow}
              disabled={updateProgress !== null && !updateReady}
            >
              {t('settings.update.download')}
            </button>
          )}
          {updatePrompt && updateReady && (
            <button className="btn-primary" onClick={onInstall}>
              {t('settings.update.restart')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
