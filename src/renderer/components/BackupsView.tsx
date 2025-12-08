import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../shared/server declaration';
import '../style/components.css';

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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>バックアップ管理</h3>
        <button
          className="btn-primary"
          onClick={handleCreateBackup}
          disabled={processing}
          style={{ opacity: processing ? 0.7 : 1 }}
        >
          {processing ? '処理中...' : '+ バックアップ作成'}
        </button>
      </div>

      <div style={{
        flex: 1,
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        overflowY: 'auto'
      }}>
        {loading && <div style={{ padding: '20px', textAlign: 'center' }}>読み込み中...</div>}

        {!loading && backups.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            バックアップはまだありません
          </div>
        )}

        {!loading && backups.map((backup) => (
          <div
            key={backup.name}
            style={{
              padding: '15px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}
          >
            <div style={{ fontSize: '1.5rem' }}>📦</div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--text-primary)' }}>
                {backup.name}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {formatDate(backup.date)}
              </div>
            </div>

            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', width: '80px', textAlign: 'right' }}>
              {formatSize(backup.size)}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn-secondary"
                onClick={() => handleRestore(backup.name)}
                disabled={processing}
                style={{ fontSize: '0.85rem', padding: '6px 12px' }}
              >
                復元
              </button>
              <button
                className="btn-stop"
                onClick={() => handleDelete(backup.name)}
                disabled={processing}
                style={{ fontSize: '0.85rem', padding: '6px 12px' }}
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '15px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        ※ バックアップは <code>{server.path}/backups</code> に保存されます。
      </div>
    </div>
  );
}