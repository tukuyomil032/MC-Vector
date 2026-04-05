import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { ask } from '@tauri-apps/plugin-dialog';
import { useEffect, useMemo, useState } from 'react';
import {
  createBackup,
  deleteBackup,
  listBackupsWithMetadata,
  restoreBackup,
} from '../../lib/backup-commands';
import {
  deleteItem,
  listFiles,
  listFilesWithMetadata,
  readJsonFile,
  writeJsonFile,
} from '../../lib/file-commands';
import { tauriListen } from '../../lib/tauri-api';
import { type MinecraftServer } from '../shared/server declaration';
import { useToast } from './ToastProvider';

interface Props {
  server: MinecraftServer;
}

interface Backup {
  name: string;
  date: Date;
  size: number;
}

type BackupMode = 'full' | 'differential';

interface BackupSnapshotEntry {
  size: number;
  modified: number;
}

interface BackupCatalogEntry {
  mode: BackupMode;
  parent: string | null;
  tags: string[];
  note: string;
  sourceCount: number;
  createdAt: string;
}

interface BackupCatalog {
  lastBackupName: string | null;
  latestSnapshot: Record<string, BackupSnapshotEntry>;
  entries: Record<string, BackupCatalogEntry>;
}

const BACKUP_META_FILE = '.mc-vector-backup-meta.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeBackupName(backupName: string): string {
  return backupName.endsWith('.zip') ? backupName : `${backupName}.zip`;
}

function parseBackupMode(value: unknown): BackupMode {
  return value === 'differential' ? 'differential' : 'full';
}

function createEmptyCatalog(): BackupCatalog {
  return {
    lastBackupName: null,
    latestSnapshot: {},
    entries: {},
  };
}

function sanitizeCatalog(value: unknown): BackupCatalog {
  if (!isRecord(value)) {
    return createEmptyCatalog();
  }

  const latestSnapshotRaw = isRecord(value.latestSnapshot) ? value.latestSnapshot : {};
  const latestSnapshot: Record<string, BackupSnapshotEntry> = {};
  for (const [path, entry] of Object.entries(latestSnapshotRaw)) {
    if (!isRecord(entry)) {
      continue;
    }

    const size = typeof entry.size === 'number' && Number.isFinite(entry.size) ? entry.size : 0;
    const modified =
      typeof entry.modified === 'number' && Number.isFinite(entry.modified) ? entry.modified : 0;
    latestSnapshot[path] = {
      size,
      modified,
    };
  }

  const entriesRaw = isRecord(value.entries) ? value.entries : {};
  const entries: Record<string, BackupCatalogEntry> = {};
  for (const [backupName, entry] of Object.entries(entriesRaw)) {
    if (!isRecord(entry)) {
      continue;
    }

    const tags = Array.isArray(entry.tags)
      ? entry.tags
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : [];

    entries[backupName] = {
      mode: parseBackupMode(entry.mode),
      parent: typeof entry.parent === 'string' ? entry.parent : null,
      tags,
      note: typeof entry.note === 'string' ? entry.note : '',
      sourceCount:
        typeof entry.sourceCount === 'number' && Number.isFinite(entry.sourceCount)
          ? entry.sourceCount
          : 0,
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
    };
  }

  return {
    lastBackupName: typeof value.lastBackupName === 'string' ? value.lastBackupName : null,
    latestSnapshot,
    entries,
  };
}

function parseTagsInput(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export default function BackupsView({ server }: Props) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [customName, setCustomName] = useState('');
  const [compressionLevel, setCompressionLevel] = useState(5);
  const [backupMode, setBackupMode] = useState<BackupMode>('full');
  const [backupCatalog, setBackupCatalog] = useState<BackupCatalog>(createEmptyCatalog());
  const [worlds, setWorlds] = useState<string[]>([]);
  const [tagEditorTarget, setTagEditorTarget] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const { showToast } = useToast();
  const backupMetaPath = useMemo(() => `${server.path}/backups/${BACKUP_META_FILE}`, [server.path]);

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
    let unlisten: (() => void) | undefined;

    tauriListen<{ serverPath: string; paths: string[] }>('backup-selector:apply', (payload) => {
      if (payload.serverPath !== server.path) {
        return;
      }

      setSelectedPaths(new Set(payload.paths));
      showToast(`バックアップ対象を ${payload.paths.length} 件更新しました`, 'success');
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, [server.path, showToast]);

  useEffect(() => {
    void (async () => {
      await loadBackups();
      await loadBackupCatalog();
      await loadWorlds();
    })();
  }, [server.path]);

  const persistBackupCatalog = async (catalog: BackupCatalog) => {
    await writeJsonFile(backupMetaPath, catalog);
  };

  const loadBackupCatalog = async () => {
    const value = await readJsonFile(backupMetaPath);
    setBackupCatalog(sanitizeCatalog(value));
  };

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
    setBackupMode('full');
    try {
      const entries = await listFiles(server.path);
      const initial = entries
        .filter((entry) => entry.name !== 'backups')
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
      setSelectedPaths(new Set(initial));
    } catch (error) {
      console.error(error);
      setSelectedPaths(new Set());
    }
  };

  const loadWorlds = async () => {
    try {
      const entries = await listFiles(server.path);
      const candidates = entries.filter((entry) => entry.isDirectory && entry.name !== 'backups');

      const worldNames: string[] = [];
      await Promise.all(
        candidates.map(async (candidate) => {
          try {
            const children = await listFiles(`${server.path}/${candidate.name}`);
            const hasLevelDat = children.some(
              (child) => !child.isDirectory && child.name === 'level.dat',
            );
            if (hasLevelDat || /^world($|[_-])/i.test(candidate.name)) {
              worldNames.push(candidate.name);
            }
          } catch (error) {
            console.error(error);
          }
        }),
      );

      const unique = Array.from(new Set(worldNames)).sort((a, b) => a.localeCompare(b));
      setWorlds(unique);
    } catch (error) {
      console.error(error);
      setWorlds([]);
    }
  };

  const clearAll = () => setSelectedPaths(new Set());

  const openSelectorWindow = async () => {
    try {
      const label = 'backup-selector';
      const selected = Array.from(selectedPaths).sort((a, b) => a.localeCompare(b));

      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        await existing.emit('backup-selector:load', {
          serverPath: server.path,
          selected,
        });

        try {
          await existing.setFocus();
        } catch (focusError) {
          console.error(focusError);
        }
        return;
      }

      const params = new URLSearchParams({
        backupSelector: '1',
        serverPath: server.path,
        selected: JSON.stringify(selected),
      });

      const selectorWindow = new WebviewWindow(label, {
        title: `Backup Target Selector - ${server.name}`,
        url: `/?${params.toString()}`,
        width: 980,
        height: 760,
        resizable: true,
        center: true,
        focus: true,
      });

      selectorWindow.once('tauri://created', () => {
        void selectorWindow.emit('backup-selector:load', {
          serverPath: server.path,
          selected,
        });
      });

      selectorWindow.once('tauri://error', (error) => {
        console.error(error);
        showToast('バックアップ選択ウィンドウを開けませんでした', 'error');
      });
    } catch (error) {
      console.error(error);
      showToast('バックアップ選択ウィンドウを開けませんでした', 'error');
    }
  };

  const buildSnapshotForSelection = async (
    paths: string[],
  ): Promise<Record<string, BackupSnapshotEntry>> => {
    const snapshot: Record<string, BackupSnapshotEntry> = {};
    const rootEntries = await listFilesWithMetadata(server.path);
    const rootMap = new Map(rootEntries.map((entry) => [entry.name, entry]));

    const walkDirectory = async (relativeDir: string) => {
      const entries = await listFilesWithMetadata(`${server.path}/${relativeDir}`);
      for (const entry of entries) {
        const childRelative = `${relativeDir}/${entry.name}`;
        if (entry.isDirectory) {
          await walkDirectory(childRelative);
          continue;
        }
        snapshot[childRelative] = {
          size: entry.size,
          modified: entry.modified,
        };
      }
    };

    for (const selectedPath of paths) {
      const normalizedPath = selectedPath.replace(/^\/+/, '').replace(/\\/g, '/');
      if (!normalizedPath || normalizedPath === 'backups') {
        continue;
      }

      const [rootName, ...rest] = normalizedPath.split('/');
      if (!rootName) {
        continue;
      }

      if (rest.length === 0) {
        const rootEntry = rootMap.get(rootName);
        if (!rootEntry) {
          continue;
        }

        if (rootEntry.isDirectory) {
          await walkDirectory(rootName);
        } else {
          snapshot[rootName] = {
            size: rootEntry.size,
            modified: rootEntry.modified,
          };
        }
        continue;
      }

      const parentRelative =
        rest.length > 1 ? `${rootName}/${rest.slice(0, -1).join('/')}` : rootName;
      const targetName = rest[rest.length - 1];

      try {
        const entries = await listFilesWithMetadata(`${server.path}/${parentRelative}`);
        const targetEntry = entries.find((entry) => entry.name === targetName);
        if (!targetEntry) {
          continue;
        }

        if (targetEntry.isDirectory) {
          await walkDirectory(normalizedPath);
        } else {
          snapshot[normalizedPath] = {
            size: targetEntry.size,
            modified: targetEntry.modified,
          };
        }
      } catch (error) {
        console.error(error);
      }
    }

    return snapshot;
  };

  const getBackupMeta = (backupName: string): BackupCatalogEntry => {
    const existing = backupCatalog.entries[backupName];
    if (existing) {
      return existing;
    }
    return {
      mode: 'full',
      parent: null,
      tags: [],
      note: '',
      sourceCount: 0,
      createdAt: '',
    };
  };

  const handleCreateBackup = async () => {
    if (processing) {
      return;
    }

    if (selectedPaths.size === 0) {
      showToast('バックアップ対象を1つ以上選択してください', 'info');
      return;
    }

    setProcessing(true);
    try {
      const requestedName = customName.trim() || defaultName();
      const normalizedName = normalizeBackupName(requestedName);
      const selected = Array.from(selectedPaths).sort((a, b) => a.localeCompare(b));

      const snapshot = await buildSnapshotForSelection(selected);
      let sourcesForBackup = selected;
      let parentBackupName: string | null = null;

      if (backupMode === 'differential') {
        parentBackupName = backupCatalog.lastBackupName;
        const changed = Object.entries(snapshot)
          .filter(([path, nextEntry]) => {
            const previous = backupCatalog.latestSnapshot[path];
            if (!previous) {
              return true;
            }
            return previous.size !== nextEntry.size || previous.modified !== nextEntry.modified;
          })
          .map(([path]) => path)
          .sort((a, b) => a.localeCompare(b));

        if (changed.length === 0) {
          showToast('前回バックアップから差分がないためスキップしました', 'info');
          return;
        }

        sourcesForBackup = changed;
      }

      await createBackup(server.path, normalizedName, sourcesForBackup, compressionLevel);

      const currentMeta = getBackupMeta(normalizedName);
      const nextCatalog: BackupCatalog = {
        lastBackupName: normalizedName,
        latestSnapshot: snapshot,
        entries: {
          ...backupCatalog.entries,
          [normalizedName]: {
            ...currentMeta,
            mode: backupMode,
            parent: backupMode === 'differential' ? parentBackupName : null,
            sourceCount: sourcesForBackup.length,
            createdAt: currentMeta.createdAt || new Date().toISOString(),
          },
        },
      };

      await persistBackupCatalog(nextCatalog);
      setBackupCatalog(nextCatalog);

      showToast(
        backupMode === 'differential'
          ? `差分バックアップを作成しました (${sourcesForBackup.length} 件)`
          : 'バックアップを作成しました！',
        'success',
      );

      setShowCreateModal(false);
      await loadBackups();
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
      const nextCatalog: BackupCatalog = {
        ...backupCatalog,
        lastBackupName:
          backupCatalog.lastBackupName === backupName ? null : backupCatalog.lastBackupName,
        entries: {
          ...backupCatalog.entries,
        },
      };
      delete nextCatalog.entries[backupName];

      await persistBackupCatalog(nextCatalog);
      setBackupCatalog(nextCatalog);
      await loadBackups();
    } catch (e) {
      console.error(e);
    }
  };

  const openTagEditor = (backupName: string) => {
    const meta = getBackupMeta(backupName);
    setTagEditorTarget(backupName);
    setTagInput(meta.tags.join(', '));
    setNoteInput(meta.note);
  };

  const handleSaveTagEditor = async () => {
    if (!tagEditorTarget) {
      return;
    }

    const tags = parseTagsInput(tagInput);
    const current = getBackupMeta(tagEditorTarget);
    const nextCatalog: BackupCatalog = {
      ...backupCatalog,
      entries: {
        ...backupCatalog.entries,
        [tagEditorTarget]: {
          ...current,
          tags,
          note: noteInput.trim(),
          createdAt: current.createdAt || new Date().toISOString(),
        },
      },
    };

    await persistBackupCatalog(nextCatalog);
    setBackupCatalog(nextCatalog);
    setTagEditorTarget(null);
    showToast('バックアップタグを保存しました', 'success');
  };

  const handleDeleteWorld = async (worldName: string) => {
    const confirmed = await ask(`ワールド「${worldName}」を削除しますか？`, {
      title: 'ワールド削除',
      kind: 'warning',
    });
    if (!confirmed) {
      return;
    }

    const finalConfirm = await ask(
      'この操作は取り消せません。バックアップがあることを確認しましたか？',
      {
        title: '最終確認',
        kind: 'warning',
      },
    );
    if (!finalConfirm) {
      return;
    }

    setProcessing(true);
    try {
      await deleteItem(`${server.path}/${worldName}`);
      showToast(`ワールド ${worldName} を削除しました`, 'success');
      await loadWorlds();
    } catch (error) {
      console.error(error);
      showToast('ワールド削除に失敗しました', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) {
      return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className="backups-view">
      <div className="backups-view__header">
        <h3>バックアップ管理</h3>
        <button
          className="btn-primary disabled:opacity-70"
          onClick={openCreateModal}
          disabled={processing}
        >
          {processing ? '処理中...' : '+ バックアップ作成'}
        </button>
      </div>

      <div className="backups-view__list-panel">
        {loading && <div className="p-5 text-center">読み込み中...</div>}

        {!loading && backups.length === 0 && (
          <div className="backups-view__empty">バックアップはまだありません</div>
        )}

        {!loading &&
          backups.map((backup) => (
            <div key={backup.name} className="backups-view__item-row">
              <div className="text-2xl">📦</div>

              <div className="flex-1">
                <div className="font-bold text-base text-text-primary">{backup.name}</div>
                <div className="text-sm text-text-secondary mt-1">{formatDate(backup.date)}</div>
                <div className="backups-view__item-meta mt-2">
                  <span
                    className={`backups-view__mode-badge ${
                      getBackupMeta(backup.name).mode === 'differential' ? 'is-diff' : ''
                    }`}
                  >
                    {getBackupMeta(backup.name).mode === 'differential' ? '差分' : 'フル'}
                  </span>

                  {getBackupMeta(backup.name).parent && (
                    <span className="backups-view__parent-label">
                      親: {getBackupMeta(backup.name).parent}
                    </span>
                  )}

                  {getBackupMeta(backup.name).tags.map((tag) => (
                    <span key={`${backup.name}-${tag}`} className="backups-view__tag-chip">
                      {tag}
                    </span>
                  ))}
                </div>

                {getBackupMeta(backup.name).note && (
                  <div className="backups-view__item-note mt-1.5">
                    {getBackupMeta(backup.name).note}
                  </div>
                )}
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
                  className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-70"
                  onClick={() => openTagEditor(backup.name)}
                  disabled={processing}
                >
                  タグ
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

      <div className="backups-view__world-panel">
        <div className="backups-view__world-header">
          <h4 className="backups-view__world-title">ワールド管理</h4>
          <span className="backups-view__world-help">レベルデータ検出済みワールド</span>
        </div>

        {worlds.length === 0 ? (
          <div className="backups-view__world-empty">削除可能なワールドが見つかりません</div>
        ) : (
          worlds.map((worldName) => (
            <div key={worldName} className="backups-view__world-row">
              <div className="backups-view__world-name">🌍 {worldName}</div>
              <button
                type="button"
                className="btn-stop text-sm px-3 py-1.5 disabled:opacity-70"
                onClick={() => void handleDeleteWorld(worldName)}
                disabled={processing}
              >
                ワールド削除
              </button>
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <div
          className="backups-view__create-overlay modal-backdrop"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="backups-view__create-panel modal-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="backups-view__create-header">
              <div className="text-lg font-bold">バックアップを作成</div>
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                閉じる
              </button>
            </div>

            <div className="backups-view__create-body">
              <div className="backups-view__form-grid">
                <div className="backups-view__form-group">
                  <label className="backups-view__form-label">ZIPファイル名（省略可）</label>
                  <input
                    className="input-field"
                    placeholder={defaultName()}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                  <div className="backups-view__form-help">
                    未指定の場合は「{defaultName()}」が使われます
                  </div>
                </div>

                <div className="backups-view__form-group">
                  <label className="backups-view__form-label">圧縮レベル (1-9)</label>
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
                  <div className="backups-view__form-help">1: 低圧縮 / 9: 高圧縮</div>
                </div>

                <div className="backups-view__form-group">
                  <label className="backups-view__form-label">バックアップモード</label>
                  <select
                    className="input-field"
                    value={backupMode}
                    onChange={(event) => setBackupMode(event.target.value as BackupMode)}
                  >
                    <option value="full">フルバックアップ</option>
                    <option value="differential">差分バックアップ（前回との差分）</option>
                  </select>
                  <div className="backups-view__form-help">
                    差分モードは前回バックアップ以降に変更されたファイルのみを対象にします。
                  </div>
                </div>
              </div>

              <div className="backups-view__selection-header">
                <div className="font-semibold">バックアップ対象を選択</div>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary text-sm"
                    onClick={() => void openSelectorWindow()}
                  >
                    別ウィンドウで選択
                  </button>
                  <button className="btn-secondary text-sm" onClick={clearAll}>
                    全解除
                  </button>
                </div>
              </div>

              <div className="backups-view__tree-panel">
                {selectedPaths.size === 0 ? (
                  <div className="backups-view__tree-loading">
                    対象が未選択です。別ウィンドウで選択してください。
                  </div>
                ) : (
                  <div className="backups-view__selected-summary">
                    <div className="backups-view__selected-count">
                      選択中: {selectedPaths.size} 件
                    </div>
                    <div className="backups-view__selected-list">
                      {Array.from(selectedPaths)
                        .sort((left, right) => left.localeCompare(right))
                        .slice(0, 14)
                        .map((path) => (
                          <div key={path} className="backups-view__selected-item">
                            {path}
                          </div>
                        ))}
                      {selectedPaths.size > 14 && (
                        <div className="backups-view__selected-item">
                          ...他 {selectedPaths.size - 14} 件
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="backups-view__create-actions">
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

      {tagEditorTarget && (
        <div
          className="backups-view__tag-overlay modal-backdrop"
          onClick={() => setTagEditorTarget(null)}
        >
          <div
            className="backups-view__tag-panel modal-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="backups-view__tag-header">
              <h4 className="backups-view__tag-title">バックアップタグ編集</h4>
              <div className="backups-view__tag-target">{tagEditorTarget}</div>
            </div>

            <div className="backups-view__tag-body">
              <label className="backups-view__form-label">タグ（カンマ区切り）</label>
              <input
                className="input-field"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder="例: release, before-update"
              />

              <label className="backups-view__form-label mt-3">メモ</label>
              <textarea
                className="input-field backups-view__tag-note"
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
                placeholder="このバックアップの用途を記録"
              />
            </div>

            <div className="backups-view__tag-actions">
              <button className="btn-secondary" onClick={() => setTagEditorTarget(null)}>
                キャンセル
              </button>
              <button className="btn-primary" onClick={() => void handleSaveTagEditor()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
