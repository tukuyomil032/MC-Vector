import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../shared/server declaration';

interface Props {
  server: MinecraftServer;
}

interface Backup {
  name: string;
  date: Date;
  size: number;
}

export default function BackupsView({ server }: Props) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadBackups();
  }, [server.id]);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const list = await window.electronAPI.listBackups(server.path);
      setBackups(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!confirm('現在のサーバーデータのバックアップを作成しますか？')) return;
    setProcessing(true);
    try {
      const success = await window.electronAPI.createBackup(server.id, server.path);
      if (success) {
        alert('バックアップを作成しました！');
        loadBackups();
      } else {
        alert('バックアップ作成に失敗しました。');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleRestore = async (backupName: string) => {
    if (!confirm(`警告：${backupName} を復元しますか？\n現在のデータは上書きされます。この操作は取り消せません。`)) return;
    setProcessing(true);
    try {
      const success = await window.electronAPI.restoreBackup(server.path, backupName);
      if (success) {
        alert('復元が完了しました！');
      } else {
        alert('復元に失敗しました。');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (backupName: string) => {
    if (!confirm(`本当に ${backupName} を削除しますか？`)) return;
    try {
      const success = await window.electronAPI.deleteBackup(server.path, backupName);
      if (success) {
        loadBackups();
      } else {
        alert('削除に失敗しました。');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className="h-full flex flex-col p-5">

      <div className="flex justify-between items-center mb-5">
        <h3>バックアップ管理</h3>
        <button
          className="btn-primary disabled:opacity-70"
          onClick={handleCreateBackup}
          disabled={processing}
        >
          {processing ? '処理中...' : '+ バックアップ作成'}
        </button>
      </div>

      <div className="flex-1 bg-bg-secondary rounded-lg border border-border-color overflow-y-auto">
        {loading && <div className="p-5 text-center">読み込み中...</div>}

        {!loading && backups.length === 0 && (
          <div className="p-10 text-center text-text-secondary">
            バックアップはまだありません
          </div>
        )}

        {!loading && backups.map((backup) => (
          <div
            key={backup.name}
            className="px-5 py-4 border-b border-white/5 flex items-center gap-5"
          >
            <div className="text-2xl">📦</div>

            <div className="flex-1">
              <div className="font-bold text-base text-text-primary">
                {backup.name}
              </div>
              <div className="text-sm text-text-secondary mt-1">
                {formatDate(backup.date)}
              </div>
            </div>

            <div className="text-text-secondary text-sm w-20 text-right">
              {formatSize(backup.size)}
            </div>

            <div className="flex gap-2.5">
              <button
                className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-70"
                onClick={() => handleRestore(backup.name)}
                disabled={processing}
              >
                復元
              </button>
              <button
                className="btn-stop text-sm px-3 py-1.5 disabled:opacity-70"
                onClick={() => handleDelete(backup.name)}
                disabled={processing}
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs text-text-secondary">
        ※ バックアップは <code className="font-mono">{server.path}/backups</code> に保存されます。
      </div>
    </div>
  );
}