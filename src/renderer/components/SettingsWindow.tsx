import { useMemo, useState } from 'react';
import { useTranslation } from '../../i18n';
import type { LocaleCode } from '../../i18n';
import { saveAppSettings } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';
import { checkForUpdates, downloadAndInstallUpdate } from '../../lib/update-commands';
import { useSettingsStore } from '../../store/settingsStore';

interface UpdateState {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';
  version?: string;
  releaseNotes?: unknown;
  progress?: number;
  error?: string;
}

function normalizeReleaseNotes(notes: unknown): string {
  if (typeof notes === 'string') {
    return notes;
  }
  if (Array.isArray(notes)) {
    return notes
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
  return '';
}

const SettingsWindow = ({ onClose }: { onClose?: () => void }) => {
  const { t, locale, setLocale } = useTranslation();
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });
  const [isSavingSecuritySetting, setIsSavingSecuritySetting] = useState(false);
  const [securitySettingError, setSecuritySettingError] = useState<string | undefined>();
  const liquidGlassEnabled = useSettingsStore((state) => state.liquidGlassEnabled);
  const setLiquidGlassEnabled = useSettingsStore((state) => state.setLiquidGlassEnabled);
  const allowUnverifiedPluginDownloads = useSettingsStore(
    (state) => state.allowUnverifiedPluginDownloads,
  );
  const setAllowUnverifiedPluginDownloads = useSettingsStore(
    (state) => state.setAllowUnverifiedPluginDownloads,
  );

  const releaseNotesText = useMemo(
    () => normalizeReleaseNotes(updateState.releaseNotes),
    [updateState.releaseNotes],
  );

  const handleCheck = async () => {
    setUpdateState({ status: 'checking' });
    try {
      const result = await checkForUpdates();
      if (result.error) {
        setUpdateState({ status: 'error', error: result.error });
        return;
      }

      if (result.available) {
        setUpdateState({
          status: 'available',
          version: result.version,
          releaseNotes: result.body,
        });
      } else {
        setUpdateState({ status: 'not-available' });
      }
    } catch (e) {
      setUpdateState({ status: 'error', error: String(e) });
    }
  };

  const handleDownload = async () => {
    setUpdateState((prev) => ({
      ...prev,
      status: 'downloading',
      progress: prev.progress ?? 0,
    }));
    try {
      await downloadAndInstallUpdate((downloaded, total) => {
        const pct = total > 0 ? (downloaded / total) * 100 : 0;
        setUpdateState((prev) => ({ ...prev, progress: pct }));
      });
    } catch (e) {
      setUpdateState({ status: 'error', error: String(e) });
    }
  };

  const handleInstall = async () => {
    await handleDownload();
  };

  const handleLanguageChange = async (value: LocaleCode) => {
    await setLocale(value);
  };

  const handleLiquidGlassToggle = async (enabled: boolean) => {
    setLiquidGlassEnabled(enabled);
    try {
      await saveAppSettings({ liquidGlassEnabled: enabled });
    } catch (error) {
      logError('Failed to persist liquid glass enabled setting', error, { enabled });
    }
  };

  const handleAllowUnverifiedPluginDownloadsToggle = async (enabled: boolean) => {
    if (isSavingSecuritySetting) {
      return;
    }
    const previousValue = allowUnverifiedPluginDownloads;
    setSecuritySettingError(undefined);
    setAllowUnverifiedPluginDownloads(enabled);
    setIsSavingSecuritySetting(true);

    try {
      await saveAppSettings({ allowUnverifiedPluginDownloads: enabled });
    } catch (error) {
      setAllowUnverifiedPluginDownloads(previousValue);
      setSecuritySettingError(t('settings.security.saveError'));
      logError('Failed to persist unverified plugin downloads setting', error, { enabled });
    } finally {
      setIsSavingSecuritySetting(false);
    }
  };

  return (
    <div className="settings-window" data-testid="settings-window">
      <div className="settings-window__header">
        {onClose && (
          <button className="btn-secondary text-sm" onClick={onClose}>
            {t('settings.backButton')}
          </button>
        )}
        <h1 className="text-2xl font-semibold m-0">{t('settings.title')}</h1>
      </div>

      <section className="settings-window__section">
        <div className="settings-window__section-head">
          <div>
            <h2 className="text-lg m-0">{t('settings.update.title')}</h2>
            <p className="text-sm text-zinc-400 m-0">{t('settings.update.description')}</p>
          </div>
          <div className="flex gap-2">
            {['idle', 'not-available', 'error'].includes(updateState.status) && (
              <button
                className="btn-secondary"
                onClick={handleCheck}
                disabled={updateState.status === 'checking'}
              >
                {updateState.status === 'checking'
                  ? t('settings.update.checking')
                  : t('settings.update.checkButton')}
              </button>
            )}
            {updateState.status === 'available' && (
              <button className="btn-secondary" onClick={handleDownload}>
                {t('settings.update.download')}
              </button>
            )}
            {updateState.status === 'downloaded' && (
              <button className="btn-primary" onClick={handleInstall}>
                {t('settings.update.restart')}
              </button>
            )}
          </div>
        </div>

        <div className="settings-window__status-body">
          {updateState.status === 'idle' && <div>{t('settings.update.idle')}</div>}
          {updateState.status === 'checking' && <div>{t('settings.update.checkingStatus')}</div>}
          {updateState.status === 'available' && (
            <div className="text-accent font-semibold">
              {t('settings.update.available', { version: updateState.version || 'unknown' })}
            </div>
          )}
          {updateState.status === 'not-available' && <div>{t('settings.update.notAvailable')}</div>}
          {updateState.status === 'downloading' && (
            <div>
              {t('settings.update.downloading', {
                progress: Math.round(updateState.progress || 0),
              })}
              <div className="settings-window__progress-track">
                <div
                  className="settings-window__progress-bar"
                  style={{ width: `${Math.min(100, Math.round(updateState.progress || 0))}%` }}
                />
              </div>
            </div>
          )}
          {updateState.status === 'downloaded' && <div>{t('settings.update.downloaded')}</div>}
          {updateState.status === 'error' && (
            <div className="text-red-400">
              {t('settings.update.error', { message: updateState.error || '' })}
            </div>
          )}
        </div>

        {releaseNotesText && (
          <div className="settings-window__release-notes">
            <div className="settings-window__release-notes-label">
              {t('settings.update.releaseNotes')}
            </div>
            <pre className="settings-window__release-notes-body">{releaseNotesText}</pre>
          </div>
        )}
      </section>

      <section className="settings-window__section">
        <div className="settings-window__section-head">
          <div>
            <h2 className="text-lg m-0">{t('settings.language.title')}</h2>
            <p className="text-sm text-zinc-400 m-0">{t('settings.language.description')}</p>
          </div>
        </div>

        <label className="text-sm text-zinc-300 block mb-2" htmlFor="language-select">
          {t('settings.language.label')}
        </label>
        <select
          id="language-select"
          className="settings-window__theme-select"
          value={locale}
          onChange={(e) => handleLanguageChange(e.target.value as LocaleCode)}
        >
          <option value="en">{t('settings.language.options.en')}</option>
          <option value="ja">{t('settings.language.options.ja')}</option>
        </select>
      </section>

      <section className="settings-window__section">
        <div className="settings-window__section-head">
          <div>
            <h2 className="text-lg m-0">{t('settings.security.title')}</h2>
            <p className="text-sm text-zinc-400 m-0">{t('settings.security.description')}</p>
          </div>
        </div>

        <label className="settings-window__toggle-row" htmlFor="allow-unverified-plugin-downloads">
          <input
            id="allow-unverified-plugin-downloads"
            type="checkbox"
            checked={allowUnverifiedPluginDownloads}
            disabled={isSavingSecuritySetting}
            aria-describedby="allow-unverified-plugin-downloads-warning"
            onChange={(e) => void handleAllowUnverifiedPluginDownloadsToggle(e.target.checked)}
          />
          <span>{t('settings.security.label')}</span>
        </label>
        <p
          id="allow-unverified-plugin-downloads-warning"
          className="text-sm text-amber-300 mt-3 mb-0"
        >
          {t('settings.security.warning')}
        </p>
        {isSavingSecuritySetting && (
          <p className="text-sm text-zinc-400 mt-2 mb-0" aria-live="polite">
            {t('settings.security.saving')}
          </p>
        )}
        {securitySettingError && (
          <p className="text-sm text-red-400 mt-2 mb-0" role="alert">
            {securitySettingError}
          </p>
        )}
      </section>

      <section className="settings-window__section">
        <div className="settings-window__section-head">
          <div>
            <h2 className="text-lg m-0">{t('settings.liquidGlass.title')}</h2>
            <p className="text-sm text-zinc-400 m-0">{t('settings.liquidGlass.description')}</p>
          </div>
        </div>

        <label className="settings-window__toggle-row" htmlFor="liquid-glass-toggle">
          <input
            id="liquid-glass-toggle"
            type="checkbox"
            checked={liquidGlassEnabled}
            onChange={(e) => void handleLiquidGlassToggle(e.target.checked)}
          />
          <span>{t('settings.liquidGlass.label')}</span>
        </label>
      </section>
    </div>
  );
};

export default SettingsWindow;
