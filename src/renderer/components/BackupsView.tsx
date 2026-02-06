import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../shared/server declaration';
import { useToast } from './ToastProvider';
import {
  createBackup,
  listBackupsWithMetadata,
  restoreBackup,
  deleteBackup,
} from '../../lib/backup-commands';
import { listFiles } from '../../lib/file-commands';

interface Props {
  server: MinecraftServer;
}

interface Backup {
  name: string;
  date: Date;
  size: number;
}

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export default function BackupsView({ server }: Props) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [customName, setCustomName] = useState('');
  const [compressionLevel, setCompressionLevel] = useState(5);
  const { showToast } = useToast();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyC') {
        e.preventDefault();
        setShowCreateModal(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    loadBackups();
  }, [server.path]);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const list = await listBackupsWithMetadata(server.path);
      setBackups(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const defaultName = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `Backup ${server.name} ${yyyy}-${mm}-${dd}-${hh}:${min}.zip`;
  };

  const openCreateModal = async () => {
    setShowCreateModal(true);
    setCustomName('');
    setCompressionLevel(5);
    await loadTree();
  };

  const loadTree = async () => {
    try {
      const entries = await listFiles(server.path);
      const rootNodes: FileNode[] = entries
        .filter((e) => e.name !== 'backups')
        .map((e) => ({
          name: e.name,
          path: e.name,
          isDirectory: e.isDirectory,
        }));
      setTree(rootNodes);
      setSelectedPaths(new Set(rootNodes.map((n) => n.path)));
    } catch (e) {
      console.error('Failed to load tree:', e);
      setTree([]);
    }
  };

  const togglePath = (node: FileNode, checked: boolean) => {
    const newSet = new Set(selectedPaths);
    const apply = (n: FileNode) => {
      if (checked) newSet.add(n.path);
      else newSet.delete(n.path);
      if (n.children) n.children.forEach(apply);
    };
    apply(node);
    setSelectedPaths(newSet);
  };

  const selectAll = () => {
    const all = new Set<string>();
    const collect = (nodes: FileNode[]) =>
      nodes.forEach((n) => {
        all.add(n.path);
        if (n.children) collect(n.children);
      });
    collect(tree);
    setSelectedPaths(all);
  };

  const clearAll = () => setSelectedPaths(new Set());

  const handleCreateBackup = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const backupName = customName.trim() || defaultName();
      const sources = Array.from(selectedPaths);
      await createBackup(server.path, backupName, sources, compressionLevel);
      showToast('バックアップを作成しました！', 'success');
      setShowCreateModal(false);
      loadBackups();
    } finally {
      setProcessing(false);
    }
  };

  const handleRestore = async (backupName: string) => {
    setProcessing(true);
    try {
      await restoreBackup(server.path, backupName);
      showToast('復元が完了しました！', 'success');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (backupName: string) => {
    try {
      await deleteBackup(server.path, backupName);
      loadBackups();
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
          onClick={openCreateModal}
          disabled={processing}
        >
          {processing ? '処理中...' : '+ バックアップ作成'}
        </button>
      </div>

      <div className="flex-1 bg-bg-secondary rounded-lg border border-border-color overflow-y-auto">
        {loading && <div className="p-5 text-center">読み込み中...</div>}

        {!loading && backups.length === 0 && (
          <div className="p-10 text-center text-text-secondary">バックアップはまだありません</div>
        )}

        {!loading &&
          backups.map((backup) => (
            <div
              key={backup.name}
              className="px-5 py-4 border-b border-white/5 flex items-center gap-5"
            >
              <div className="text-2xl">📦</div>

              <div className="flex-1">
                <div className="font-bold text-base text-text-primary">{backup.name}</div>
                <div className="text-sm text-text-secondary mt-1">{formatDate(backup.date)}</div>
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

      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-bg-secondary border border-border-color rounded-xl shadow-2xl w-[900px] max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-border-color flex items-center justify-between">
              <div className="text-lg font-bold">バックアップを作成</div>
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                閉じる
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-text-secondary">ZIPファイル名（省略可）</label>
                  <input
                    className="input-field"
                    placeholder={defaultName()}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                  <div className="text-xs text-text-secondary">
                    未指定の場合は「{defaultName()}」が使われます
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-text-secondary">圧縮レベル (1-9)</label>
                  <select
                    className="input-field w-[120px]"
                    value={compressionLevel}
                    onChange={(e) => setCompressionLevel(Number(e.target.value))}
                  >
                    {Array.from({ length: 9 }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-text-secondary">1: 低圧縮 / 9: 高圧縮</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="font-semibold">バックアップ対象を選択</div>
                <div className="flex gap-2">
                  <button className="btn-secondary text-sm" onClick={selectAll}>
                    全選択
                  </button>
                  <button className="btn-secondary text-sm" onClick={clearAll}>
                    全解除
                  </button>
                </div>
              </div>

              <div className="bg-bg-tertiary border border-border-color rounded-lg p-3 max-h-[40vh] overflow-y-auto">
                {tree.length === 0 ? (
                  <div className="text-text-secondary text-sm">読み込み中...</div>
                ) : (
                  <FileTree nodes={tree} selected={selectedPaths} onToggle={togglePath} />
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={processing}
                >
                  キャンセル
                </button>
                <button
                  className="btn-primary"
                  onClick={handleCreateBackup}
                  disabled={processing || selectedPaths.size === 0}
                >
                  {processing ? '作成中...' : 'バックアップを作成'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileTree({
  nodes,
  selected,
  onToggle,
}: {
  nodes: FileNode[];
  selected: Set<string>;
  onToggle: (node: FileNode, checked: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} selected={selected} onToggle={onToggle} depth={0} />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  selected,
  onToggle,
  depth,
}: {
  node: FileNode;
  selected: Set<string>;
  onToggle: (node: FileNode, checked: boolean) => void;
  depth: number;
}) {
  const isChecked = selected.has(node.path);
  return (
    <div
      className={`flex flex-col border border-transparent rounded ${isChecked ? 'bg-white/5 border-accent/40' : ''}`}
    >
      <label
        className="flex items-center gap-2 px-2 py-1 cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => onToggle(node, e.target.checked)}
        />
        <span className="text-sm text-text-primary">{node.name || '(root)'}</span>
      </label>
      {node.children && node.children.length > 0 && (
        <div className="pl-4">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selected={selected}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
