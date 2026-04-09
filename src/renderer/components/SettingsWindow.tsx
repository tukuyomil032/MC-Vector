import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../i18n';
import type { LocaleCode } from '../../i18n';
import { getAppSettings, saveAppSettings } from '../../lib/config-commands';
import { checkForUpdates, downloadAndInstallUpdate } from '../../lib/update-commands';

type AppTheme =
  | 'dark'
  | 'darkBlue'
  | 'grey'
  | 'forest'
  | 'sunset'
  | 'neon'
  | 'coffee'
  | 'ocean'
  | 'system';

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
  const [theme, setTheme] = useState<AppTheme>('system');

  const normalizeTheme = (value: unknown): AppTheme => {
    const allowed: AppTheme[] = [
      'dark',
      'darkBlue',
      'grey',
      'forest',
      'sunset',
      'neon',
      'coffee',
      'ocean',
      'system',
    ];
    return allowed.includes(value as AppTheme) ? (value as AppTheme) : 'dark';
  };

  const releaseNotesText = useMemo(
    () => normalizeReleaseNotes(updateState.releaseNotes),
    [updateState.releaseNotes],
  );

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getAppSettings();
        if (settings?.theme) {
          setTheme(normalizeTheme(settings.theme));
        }
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    };
    void loadSettings();
  }, []);

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

  const handleThemeChange = async (value: AppTheme) => {
    setTheme(value);
    await saveAppSettings({ theme: value });
  };

  const handleLanguageChange = async (value: LocaleCode) => {
    await setLocale(value);
  };

  return (
    <div className="settings-window">
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
            <h2 className="text-lg m-0">{t('settings.theme.title')}</h2>
            <p className="text-sm text-zinc-400 m-0">{t('settings.theme.description')}</p>
          </div>
        </div>

        <label className="text-sm text-zinc-300 block mb-2" htmlFor="theme-select">
          {t('settings.theme.label')}
        </label>
        <select
          id="theme-select"
          className="settings-window__theme-select"
          value={theme}
          onChange={(e) => handleThemeChange(e.target.value as AppTheme)}
        >
          <option value="dark">{t('settings.theme.options.dark')}</option>
          <option value="darkBlue">{t('settings.theme.options.darkBlue')}</option>
          <option value="grey">{t('settings.theme.options.grey')}</option>
          <option value="forest">{t('settings.theme.options.forest')}</option>
          <option value="sunset">{t('settings.theme.options.sunset')}</option>
          <option value="neon">{t('settings.theme.options.neon')}</option>
          <option value="coffee">{t('settings.theme.options.coffee')}</option>
          <option value="ocean">{t('settings.theme.options.ocean')}</option>
          <option value="system">{t('settings.theme.options.system')}</option>
        </select>
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
    </div>
  );
};

export default SettingsWindow;
