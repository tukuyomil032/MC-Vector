import { useEffect, useMemo, useState } from 'react';
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

  return (
    <div className="settings-window">
      <div className="settings-window__header">
        {onClose && (
          <button className="btn-secondary text-sm" onClick={onClose}>
            ← 戻る
          </button>
        )}
        <h1 className="text-2xl font-semibold m-0">Application Preferences</h1>
      </div>

      <section className="settings-window__section">
        <div className="settings-window__section-head">
          <div>
            <h2 className="text-lg m-0">アップデート</h2>
            <p className="text-sm text-zinc-400 m-0">最新バージョンの確認と適用を行います。</p>
          </div>
          <div className="flex gap-2">
            {['idle', 'not-available', 'error'].includes(updateState.status) && (
              <button
                className="btn-secondary"
                onClick={handleCheck}
                disabled={updateState.status === 'checking'}
              >
                {updateState.status === 'checking' ? '確認中...' : 'アップデートを確認'}
              </button>
            )}
            {updateState.status === 'available' && (
              <button className="btn-secondary" onClick={handleDownload}>
                ダウンロード
              </button>
            )}
            {updateState.status === 'downloaded' && (
              <button className="btn-primary" onClick={handleInstall}>
                再起動して適用
              </button>
            )}
          </div>
        </div>

        <div className="settings-window__status-body">
          {updateState.status === 'idle' && <div>まだ確認していません。</div>}
          {updateState.status === 'checking' && <div>更新を確認しています...</div>}
          {updateState.status === 'available' && (
            <div className="text-accent font-semibold">
              アップデートを検知しました！ v{updateState.version || 'unknown'}
            </div>
          )}
          {updateState.status === 'not-available' && <div>最新の状態です。</div>}
          {updateState.status === 'downloading' && (
            <div>
              ダウンロード中... {Math.round(updateState.progress || 0)}%
              <div className="settings-window__progress-track">
                <div
                  className="settings-window__progress-bar"
                  style={{ width: `${Math.min(100, Math.round(updateState.progress || 0))}%` }}
                />
              </div>
            </div>
          )}
          {updateState.status === 'downloaded' && (
            <div>ダウンロード完了。再起動して適用できます。</div>
          )}
          {updateState.status === 'error' && (
            <div className="text-red-400">エラー: {updateState.error}</div>
          )}
        </div>

        {releaseNotesText && (
          <div className="settings-window__release-notes">
            <div className="settings-window__release-notes-label">リリースノート:</div>
            <pre className="settings-window__release-notes-body">{releaseNotesText}</pre>
          </div>
        )}
      </section>

      <section className="settings-window__section">
        <div className="settings-window__section-head">
          <div>
            <h2 className="text-lg m-0">テーマ</h2>
            <p className="text-sm text-zinc-400 m-0">
              アプリ全体に適用される背景テーマを選択します。
            </p>
          </div>
        </div>

        <label className="text-sm text-zinc-300 block mb-2" htmlFor="theme-select">
          配色
        </label>
        <select
          id="theme-select"
          className="settings-window__theme-select"
          value={theme}
          onChange={(e) => handleThemeChange(e.target.value as AppTheme)}
        >
          <option value="dark">Dark</option>
          <option value="darkBlue">DarkBlue</option>
          <option value="grey">Grey</option>
          <option value="forest">Forest</option>
          <option value="sunset">Sunset</option>
          <option value="neon">Neon</option>
          <option value="coffee">Coffee</option>
          <option value="ocean">Ocean</option>
          <option value="system">System</option>
        </select>
      </section>
    </div>
  );
};

export default SettingsWindow;
