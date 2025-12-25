import { useEffect, useMemo, useState } from 'react';

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
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

        if (entry && typeof entry === 'object' && 'body' in entry && typeof (entry as any).body === 'string') {
          return (entry as any).body as string;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

const SettingsWindow = () => {
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });

  const releaseNotesText = useMemo(() => normalizeReleaseNotes(updateState.releaseNotes), [updateState.releaseNotes]);

  useEffect(() => {
    const disposeAvailable = window.electronAPI.onUpdateAvailable((payload) => {
      setUpdateState({ status: 'available', version: payload?.version, releaseNotes: payload?.releaseNotes });
    });
    const disposeAvailableSilent = window.electronAPI.onUpdateAvailableSilent((payload) => {
      setUpdateState({ status: 'available', version: payload?.version, releaseNotes: payload?.releaseNotes });
    });
    const disposeNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
      setUpdateState({ status: 'not-available' });
    });
    const disposeProgress = window.electronAPI.onUpdateDownloadProgress((payload) => {
      setUpdateState((prev) => ({ ...prev, status: 'downloading', progress: payload?.percent ?? prev.progress }));
    });
    const disposeDownloaded = window.electronAPI.onUpdateDownloaded((payload) => {
      setUpdateState({ status: 'downloaded', version: payload?.version, releaseNotes: payload?.releaseNotes });
    });
    const disposeError = window.electronAPI.onUpdateError((message) => {
      setUpdateState({ status: 'error', error: message });
    });

    // Initial check on load
    (async () => {
      setUpdateState({ status: 'checking' });
      const result = await window.electronAPI.checkForUpdates();
      if (result?.available) {
        setUpdateState({ status: 'available', version: result.version, releaseNotes: result.releaseNotes });
      } else {
        setUpdateState(result?.error ? { status: 'error', error: result.error } : { status: 'not-available' });
      }
    })();

    return () => {
      disposeAvailable();
      disposeAvailableSilent();
      disposeNotAvailable();
      disposeProgress();
      disposeDownloaded();
      disposeError();
    };
  }, []);

  const handleDownload = async () => {
    setUpdateState((prev) => ({ ...prev, status: 'downloading', progress: prev.progress ?? 0 }));
    await window.electronAPI.downloadUpdate();
  };

  const handleInstall = async () => {
    await window.electronAPI.installUpdate();
  };

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] text-white p-8 box-border">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <section className="bg-[#252526] border border-zinc-700 rounded-lg p-5 mb-6">
        <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
          <div>
            <h2 className="text-lg m-0">アップデート</h2>
            <p className="text-sm text-zinc-400 m-0">最新バージョンの確認と適用を行います。</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={handleDownload} disabled={updateState.status === 'downloading'}>
              ダウンロード
            </button>
            <button className="btn-primary" onClick={handleInstall} disabled={updateState.status !== 'downloaded'}>
              再起動して適用
            </button>
          </div>
        </div>

        <div className="text-sm text-zinc-300">
          {updateState.status === 'checking' && <div>更新を確認しています...</div>}
          {updateState.status === 'available' && (
            <div>
              利用可能なアップデートがあります: v{updateState.version || 'unknown'}
            </div>
          )}
          {updateState.status === 'not-available' && <div>最新の状態です。</div>}
          {updateState.status === 'downloading' && (
            <div>
              ダウンロード中... {Math.round(updateState.progress || 0)}%
              <div className="mt-2 h-2 bg-zinc-800 rounded">
                <div
                  className="h-2 bg-accent rounded"
                  style={{ width: `${Math.min(100, Math.round(updateState.progress || 0))}%` }}
                />
              </div>
            </div>
          )}
          {updateState.status === 'downloaded' && <div>ダウンロード完了。再起動して適用できます。</div>}
          {updateState.status === 'error' && <div className="text-red-400">エラー: {updateState.error}</div>}
        </div>

        {releaseNotesText && (
          <div className="mt-4">
            <div className="text-sm text-zinc-400 mb-1">リリースノート:</div>
            <pre className="bg-black/40 p-3 rounded border border-zinc-800 whitespace-pre-wrap text-sm max-h-64 overflow-y-auto">
              {releaseNotesText}
            </pre>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-500">この設定ウィンドウは今後、他の設定も追加予定です。</p>
    </div>
  );
};

export default SettingsWindow;
