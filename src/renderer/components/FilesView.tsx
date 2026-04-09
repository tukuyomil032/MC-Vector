import Editor from '@monaco-editor/react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';
import type * as React from 'react';
import { useEffect, useState } from 'react';
import {
  iconFile,
  iconFiles,
  iconFolder,
  iconImport,
  iconMove,
  iconOpenFolder,
  iconTrash,
  iconUnzip,
  iconZip,
} from '../../assets/icons';
import { useTranslation } from '../../i18n';
import { getServerRoot } from '../../lib/config-commands';
import {
  compressItem,
  createFolder,
  deleteItem,
  extractItem,
  importFilesDialog,
  importFilesFromPaths,
  listFilesWithMetadata,
  moveItem,
  openInFinder,
  readFileContent,
  saveFileContent,
} from '../../lib/file-commands';
import { type MinecraftServer } from '../components/../shared/server declaration';
import { useToast } from './ToastProvider';

interface Props {
  server: MinecraftServer;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size?: number;
}

export default function FilesView({ server }: Props) {
  const [currentPath, setCurrentPath] = useState(server.path);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [serversRootAbsPath, setServersRootAbsPath] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExternalDropActive, setIsExternalDropActive] = useState(false);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: FileEntry | null;
  } | null>(null);
  const [modalType, setModalType] = useState<string | null>(null);

  const [newFileName, setNewFileName] = useState('');
  const [createMode, setCreateMode] = useState<'folder' | 'file'>('folder');

  const [moveDestPath, setMoveDestPath] = useState('');
  const [renameFileName, setRenameFileName] = useState('');
  const { showToast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const loadRoot = async () => {
      const root = await getServerRoot();
      setServersRootAbsPath(root.replace(/\\/g, '/'));
    };
    loadRoot();
  }, []);

  useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWindow()
      .onDragDropEvent(async (event) => {
        const payload = event.payload;

        if (payload.type === 'enter' || payload.type === 'over') {
          setIsExternalDropActive(true);
          return;
        }

        if (payload.type === 'leave') {
          setIsExternalDropActive(false);
          return;
        }

        if (payload.type !== 'drop') {
          return;
        }

        setIsExternalDropActive(false);

        if (payload.paths.length === 0) {
          return;
        }

        try {
          const imported = await importFilesFromPaths(payload.paths, currentPath);
          if (imported.length > 0) {
            showToast(t('files.toast.uploadSuccess', { count: imported.length }), 'success');
            await loadFiles(currentPath);
          }
        } catch (error) {
          console.error(error);
          showToast(t('files.toast.uploadFailed'), 'error');
        }
      })
      .then((dispose) => {
        if (cancelled) {
          dispose();
          return;
        }
        unlisten = dispose;
      });

    return () => {
      cancelled = true;
      setIsExternalDropActive(false);
      unlisten?.();
    };
  }, [currentPath, showToast, t]);

  const loadFiles = async (path: string) => {
    try {
      const entries = await listFilesWithMetadata(path);
      setFiles(entries);
    } catch (e) {
      console.error('Failed to list files', e);
    }
  };

  const renderBreadcrumbs = () => {
    if (!serversRootAbsPath) {
      return <span className="font-mono">{t('files.loading')}</span>;
    }

    const normalizedCurrent = currentPath.replace(/\\/g, '/');
    const normalizedRoot = serversRootAbsPath.replace(/\\/g, '/');

    let relativePath = '';
    if (normalizedCurrent.startsWith(normalizedRoot)) {
      relativePath = normalizedCurrent.substring(normalizedRoot.length);
    } else {
      return <span className="font-mono">{currentPath}</span>;
    }

    const segments = relativePath.split('/').filter(Boolean);

    return (
      <div className="files-view__breadcrumbs">
        <span
          className="files-view__breadcrumb-link"
          onClick={() => setCurrentPath(normalizedRoot)}
        >
          {t('nav.servers')}
        </span>

        {segments.map((seg, index) => {
          const pathUpToHere = `${normalizedRoot}/${segments.slice(0, index + 1).join('/')}`;
          const normalizedServerPath = server.path.replace(/\\/g, '/');
          const isWithinServerPath = pathUpToHere.startsWith(normalizedServerPath);

          return (
            <span key={index} className="flex items-center">
              <span className="files-view__breadcrumb-separator">/</span>
              <span
                className={`files-view__breadcrumb-link ${!isWithinServerPath ? 'files-view__breadcrumb-link--disabled' : ''}`}
                onClick={() => {
                  if (isWithinServerPath) {
                    setCurrentPath(pathUpToHere);
                  }
                }}
              >
                {seg}
              </span>
            </span>
          );
        })}
      </div>
    );
  };

  const getDisplayPath = (fullPath: string) => {
    const normalizedFull = fullPath.replace(/\\/g, '/');
    const normalizedRoot = serversRootAbsPath.replace(/\\/g, '/');

    if (normalizedFull.startsWith(normalizedRoot)) {
      return normalizedFull.replace(normalizedRoot, 'servers');
    }
    return normalizedFull;
  };

  const handleRowClick = (fileName: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(fileName);
    } else {
      setSelectedFiles([fileName]);
    }
  };

  const handleCheckboxClick = (fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSelect(fileName);
  };

  const toggleSelect = (name: string) => {
    if (selectedFiles.includes(name)) {
      setSelectedFiles(selectedFiles.filter((f) => f !== name));
    } else {
      setSelectedFiles([...selectedFiles, name]);
    }
  };

  const handleFileDoubleClick = async (fileName: string) => {
    const target = files.find((f) => f.name === fileName);
    if (!target) {
      return;
    }
    if (target.isDirectory) {
      const newPath = `${currentPath}/${fileName}`.replace(/\/+/g, '/');
      const normalizedNewPath = newPath.replace(/\\/g, '/');
      const normalizedServerPath = server.path.replace(/\\/g, '/');
      if (normalizedNewPath.startsWith(normalizedServerPath)) {
        setCurrentPath(newPath);
        setSelectedFiles([]);
      }
    } else {
      try {
        const content = await readFileContent(`${currentPath}/${fileName}`);
        setEditingFile(fileName);
        setFileContent(content);
        setIsEditorOpen(true);
      } catch (e) {
        console.error('Failed to read file', e);
      }
    }
  };

  const handleGoUp = () => {
    if (currentPath === server.path) {
      return;
    }
    const parent = currentPath.split('/').slice(0, -1).join('/') || server.path;
    const normalizedParent = parent.replace(/\\/g, '/');
    const normalizedServerPath = server.path.replace(/\\/g, '/');
    if (!normalizedParent.startsWith(normalizedServerPath)) {
      setCurrentPath(server.path);
    } else {
      setCurrentPath(parent);
    }
    setSelectedFiles([]);
  };

  const handleSaveFile = async () => {
    if (!editingFile) {
      return;
    }
    setIsSaving(true);
    try {
      await saveFileContent(`${currentPath}/${editingFile}`, fileContent);
      showToast(t('files.toast.saved'), 'success');
    } catch (err) {
      console.error(err);
      showToast(t('files.toast.saveFailed'), 'error');
    }
    setIsSaving(false);
    setIsEditorOpen(false);
    setEditingFile(null);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isSave = (e.metaKey || e.ctrlKey) && e.key === 's';
      if (!isSave) {
        return;
      }
      if (!isEditorOpen) {
        return;
      }
      e.preventDefault();
      handleSaveFile();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEditorOpen, editingFile, fileContent]);

  const handleContextMenu = (e: React.MouseEvent, file: FileEntry | null) => {
    e.preventDefault();
    if (file && !selectedFiles.includes(file.name)) {
      setSelectedFiles([file.name]);
    }
    setContextMenu({ x: e.pageX, y: e.pageY, file });
  };

  const handleDelete = async () => {
    if (selectedFiles.length === 0) {
      return;
    }
    const confirmed = await ask(t('files.confirm.delete', { count: selectedFiles.length }), {
      title: t('files.confirm.deleteTitle'),
      kind: 'warning',
    });
    if (!confirmed) {
      return;
    }

    try {
      for (const name of selectedFiles) {
        await deleteItem(`${currentPath}/${name}`);
      }
      showToast(t('files.toast.deleted'), 'success');
      setSelectedFiles([]);
      loadFiles(currentPath);
      setContextMenu(null);
    } catch (e) {
      console.error(e);
      showToast(t('files.toast.deleteFailed'), 'error');
    }
  };

  const handleCreate = async () => {
    if (!newFileName) {
      return;
    }
    const target = `${currentPath}/${newFileName}`;

    try {
      if (createMode === 'folder') {
        await createFolder(currentPath, newFileName);
      } else {
        await saveFileContent(target, '');
      }
      showToast(t('files.toast.created'), 'success');
      setModalType(null);
      setNewFileName('');
      loadFiles(currentPath);
    } catch (e) {
      console.error(e);
      showToast(t('files.toast.createFailed'), 'error');
    }
  };

  const handleImport = async () => {
    setModalType(null);
    const result = await importFilesDialog(currentPath);

    if (result.length > 0) {
      loadFiles(currentPath);
      showToast(t('files.toast.imported'), 'success');
    }
  };

  const handleMove = async () => {
    if (!moveDestPath) {
      return;
    }

    let realDest = moveDestPath.replace(/\\/g, '/');
    const normalizedRoot = serversRootAbsPath.replace(/\\/g, '/');

    if (realDest.startsWith('servers/')) {
      realDest = realDest.replace('servers', normalizedRoot);
    }
    realDest = realDest.replace(/\/+/g, '/');

    try {
      if (modalType === 'moveCurrent') {
        await moveItem(currentPath, realDest);
        handleGoUp();
      } else {
        for (const name of selectedFiles) {
          const src = `${currentPath}/${name}`;
          const dest = `${realDest}/${name}`.replace(/\/+/g, '/').replace(/\\+/g, '/');
          await moveItem(src, dest);
        }
        setSelectedFiles([]);
        loadFiles(currentPath);
      }
      showToast(t('files.toast.moved'), 'success');
      setModalType(null);
    } catch (e) {
      console.error(e);
      showToast(t('files.toast.moveFailed'), 'error');
    }
  };

  const openMoveModal = (isCurrentDir: boolean) => {
    const displayPath = getDisplayPath(isCurrentDir ? currentPath : currentPath);
    setMoveDestPath(displayPath);
    setModalType(isCurrentDir ? 'moveCurrent' : 'move');
  };

  const handleRename = async () => {
    if (!renameFileName || !contextMenu?.file) {
      return;
    }
    const src = `${currentPath}/${contextMenu.file.name}`;
    const dest = `${currentPath}/${renameFileName}`;
    try {
      await moveItem(src, dest);
      showToast(t('files.toast.renamed'), 'success');
      setModalType(null);
      setRenameFileName('');
      loadFiles(currentPath);
    } catch (e) {
      console.error(e);
      showToast(t('files.toast.renameFailed'), 'error');
    }
  };

  const handleZip = async () => {
    if (selectedFiles.length === 0) {
      return;
    }
    const targets = selectedFiles.map((f) => `${currentPath}/${f}`);
    const dest = `${currentPath}/archive-${Date.now()}.zip`;
    try {
      await compressItem(targets, dest);
      showToast(t('files.toast.compressed'), 'success');
      loadFiles(currentPath);
      setContextMenu(null);
    } catch (e) {
      console.error(e);
      showToast(t('files.toast.compressFailed'), 'error');
    }
  };

  const handleUnzip = async () => {
    if (selectedFiles.length === 0) {
      return;
    }
    try {
      for (const f of selectedFiles) {
        if (f.endsWith('.zip')) {
          await extractItem(`${currentPath}/${f}`, currentPath);
        }
      }
      showToast(t('files.toast.extracted'), 'success');
      loadFiles(currentPath);
      setContextMenu(null);
    } catch (e) {
      console.error(e);
      showToast(t('files.toast.extractFailed'), 'error');
    }
  };

  const handleOpenExplorer = () => {
    openInFinder(currentPath);
  };

  const handleDragStart = (e: React.DragEvent, fileName: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ fileName, fromPath: currentPath }));
  };

  const handleDropOnFolder = async (e: React.DragEvent, folderName: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.fromPath === currentPath && data.fileName !== folderName) {
        const src = `${currentPath}/${data.fileName}`;
        const dest = `${currentPath}/${folderName}/${data.fileName}`;
        await moveItem(src, dest);
        loadFiles(currentPath);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="files-view" onClick={() => setContextMenu(null)}>
      {/* ツールバー */}
      <div className="files-view__toolbar">
        <button
          className="files-view__toolbar-btn"
          onClick={handleGoUp}
          disabled={currentPath === server.path}
          title={t('files.toolbar.goUp')}
        >
          ⬆
        </button>

        {/* パンくずリスト */}
        <div className="files-view__breadcrumb-shell">{renderBreadcrumbs()}</div>

        <button
          className="files-view__toolbar-btn"
          onClick={() => setModalType('create')}
          title={t('files.toolbar.createImport')}
        >
          +
        </button>
        <button
          className="files-view__toolbar-btn"
          onClick={handleOpenExplorer}
          title={t('files.toolbar.openExplorer')}
        >
          <img src={iconOpenFolder} className="w-4" alt="" />
        </button>
        {selectedFiles.length > 0 && (
          <>
            <div className="files-view__toolbar-divider"></div>
            <button
              className="files-view__toolbar-btn"
              onClick={() => openMoveModal(false)}
              title={t('files.toolbar.move')}
            >
              <img src={iconMove} className="w-4" alt="" />
            </button>
            <button
              className="files-view__toolbar-btn"
              onClick={handleZip}
              title={t('files.toolbar.compress')}
            >
              <img src={iconZip} className="w-4" alt="" />
            </button>
            <button
              className="files-view__toolbar-btn"
              onClick={handleUnzip}
              title={t('files.toolbar.extract')}
            >
              <img src={iconUnzip} className="w-4" alt="" />
            </button>
            <button
              className="files-view__toolbar-btn files-view__toolbar-btn--danger"
              onClick={handleDelete}
              title={t('files.toolbar.delete')}
            >
              <img src={iconTrash} className="w-4" alt="" />
            </button>
          </>
        )}
      </div>

      {/* ファイルリスト表示エリア */}
      <div
        className={`files-view__list-pane ${isExternalDropActive ? 'is-drop-active' : ''}`}
        onContextMenu={(e) => handleContextMenu(e, null)}
      >
        {isExternalDropActive && <div className="files-view__drop-hint">{t('files.dropHint')}</div>}

        <div className="flex flex-col gap-0">
          {files.map((file) => (
            <div
              key={file.name}
              className={`files-view__row ${selectedFiles.includes(file.name) ? 'is-selected' : ''}`}
              onContextMenu={(e) => {
                e.stopPropagation();
                handleContextMenu(e, file);
              }}
              onClick={(e) => handleRowClick(file.name, e)}
              onDoubleClick={() => handleFileDoubleClick(file.name)}
              draggable
              onDragStart={(e) => handleDragStart(e, file.name)}
              onDragOver={(e) => {
                if (file.isDirectory) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onDrop={(e) => {
                if (file.isDirectory) handleDropOnFolder(e, file.name);
              }}
            >
              <input
                type="checkbox"
                checked={selectedFiles.includes(file.name)}
                onClick={(e) => handleCheckboxClick(file.name, e)}
                className="cursor-pointer mr-2.5 ml-2.5"
              />
              <img
                src={file.isDirectory ? iconFolder : iconFile}
                alt=""
                className="w-5 h-5 object-contain mr-2.5"
              />
              <span
                className={`files-view__name ${file.isDirectory ? 'files-view__name--dir' : 'files-view__name--file'}`}
              >
                {file.name}
              </span>
              <span className="text-text-secondary text-xs min-w-[80px] text-right mr-2.5">
                {file.isDirectory
                  ? '-'
                  : file.size
                    ? (file.size / 1024).toFixed(1) + ' KB'
                    : '0 KB'}
              </span>
            </div>
          ))}
          {files.length === 0 && <div className="files-view__empty">{t('files.emptyFolder')}</div>}
        </div>
      </div>

      {/* Editor Modal */}
      {isEditorOpen && (
        <div className="files-view__editor-overlay">
          <div className="files-view__editor-header">
            <span>{editingFile}</span>
            <div className="files-view__editor-actions">
              <button className="btn-secondary mr-2.5" onClick={() => setIsEditorOpen(false)}>
                {t('common.close')}
              </button>
              <button
                className="btn-primary disabled:opacity-50"
                onClick={handleSaveFile}
                disabled={isSaving}
              >
                {isSaving ? t('files.editor.saving') : t('common.save')}
              </button>
            </div>
          </div>
          <Editor
            height="100%"
            defaultLanguage={
              editingFile?.endsWith('.json')
                ? 'json'
                : editingFile?.endsWith('.yml') || editingFile?.endsWith('.yaml')
                  ? 'yaml'
                  : editingFile?.endsWith('.properties')
                    ? 'ini'
                    : 'plaintext'
            }
            theme="vs-dark"
            value={fileContent}
            onChange={(val) => setFileContent(val || '')}
          />
        </div>
      )}

      {/* New Create / Import Modal */}
      {modalType === 'create' && (
        <div className="mc-modal-overlay modal-backdrop">
          <div className="mc-modal-panel modal-panel files-view__modal-panel">
            <h3 className="mc-modal-title">{t('files.modal.createImportTitle')}</h3>

            <div className="files-view__create-grid">
              <div
                className={`files-view__create-option ${createMode === 'folder' ? 'is-active' : ''}`}
                onClick={() => setCreateMode('folder')}
              >
                <img src={iconFiles} alt="" className="w-8 h-8 object-contain" />
                <span
                  className={`files-view__create-option-label ${createMode === 'folder' ? 'is-active' : 'is-idle'}`}
                >
                  {t('files.modal.folder')}
                </span>
              </div>

              <div
                className={`files-view__create-option ${createMode === 'file' ? 'is-active' : ''}`}
                onClick={() => setCreateMode('file')}
              >
                <img src={iconFile} alt="" className="w-8 h-8 object-contain" />
                <span
                  className={`files-view__create-option-label ${createMode === 'file' ? 'is-active' : 'is-idle'}`}
                >
                  {t('files.modal.file')}
                </span>
              </div>

              <div
                className="files-view__create-option files-view__create-option--import"
                onClick={handleImport}
              >
                <img src={iconImport} alt="" className="w-8 h-8 object-contain" />
                <span className="files-view__create-option-label is-idle">
                  {t('files.modal.import')}
                </span>
              </div>
            </div>

            <label className="files-view__modal-label">{t('files.modal.nameLabel')}</label>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={
                createMode === 'folder'
                  ? t('files.modal.newFolderPlaceholder')
                  : t('files.modal.newFilePlaceholder')
              }
              className="mc-modal-input"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />

            <div className="mc-modal-footer">
              <button onClick={() => setModalType(null)} className="mc-modal-btn-secondary">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCreate}
                className="mc-modal-btn-primary"
                disabled={!newFileName}
              >
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {(modalType === 'move' || modalType === 'moveCurrent') && (
        <div className="mc-modal-overlay modal-backdrop">
          <div className="mc-modal-panel modal-panel files-view__modal-panel">
            <h3 className="mc-modal-title">
              {modalType === 'moveCurrent'
                ? t('files.modal.moveDirectoryTitle')
                : t('files.modal.moveTitle')}
            </h3>
            <p className="text-zinc-400 text-sm mb-2.5">
              {modalType === 'moveCurrent'
                ? t('files.modal.moveDirectoryDescription')
                : t('files.modal.moveDescription', { count: selectedFiles.length })}
            </p>
            <input
              type="text"
              value={moveDestPath}
              onChange={(e) => setMoveDestPath(e.target.value)}
              placeholder={t('files.modal.moveDestPlaceholder')}
              className="mc-modal-input"
            />
            <div className="mc-modal-footer">
              <button onClick={() => setModalType(null)} className="mc-modal-btn-secondary">
                {t('common.cancel')}
              </button>
              <button onClick={handleMove} className="mc-modal-btn-primary">
                {t('files.modal.moveButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {modalType === 'rename' && (
        <div className="mc-modal-overlay modal-backdrop">
          <div className="mc-modal-panel modal-panel files-view__modal-panel">
            <h3 className="mc-modal-title">{t('files.modal.renameTitle')}</h3>
            <input
              type="text"
              value={renameFileName}
              onChange={(e) => setRenameFileName(e.target.value)}
              className="mc-modal-input"
              autoFocus
            />
            <div className="mc-modal-footer">
              <button onClick={() => setModalType(null)} className="mc-modal-btn-secondary">
                {t('common.cancel')}
              </button>
              <button onClick={handleRename} className="mc-modal-btn-primary">
                {t('files.modal.renameButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu (機能追加・画像付き) */}
      {contextMenu && (
        <div
          className="files-view__context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.file ? (
            <>
              {/* 1. 名前の変更 (画像なしのため透明なスペースで位置合わせ) */}
              <div
                className="files-view__context-item"
                onClick={() => {
                  setRenameFileName(contextMenu.file!.name);
                  setModalType('rename');
                  setContextMenu(null);
                }}
              >
                <div className="files-view__context-spacer"></div>
                {t('files.contextMenu.rename')}
              </div>

              {/* 2. アイテムを移動 */}
              <div
                className="files-view__context-item"
                onClick={() => {
                  openMoveModal(false);
                  setContextMenu(null);
                }}
              >
                <img src={iconMove} className="files-view__context-icon" alt="" />
                {t('files.contextMenu.moveItem')}
              </div>

              {/* 3. アイテムを圧縮 */}
              <div
                className="files-view__context-item"
                onClick={() => {
                  handleZip();
                  setContextMenu(null);
                }}
              >
                <img src={iconZip} className="files-view__context-icon" alt="" />
                {t('files.contextMenu.compressItem')}
              </div>

              {/* 4. アイテムを解凍 */}
              <div
                className="files-view__context-item"
                onClick={() => {
                  handleUnzip();
                  setContextMenu(null);
                }}
              >
                <img src={iconUnzip} className="files-view__context-icon" alt="" />
                {t('files.contextMenu.extractItem')}
              </div>

              {/* 5. アイテムを削除 */}
              <div
                className="files-view__context-item files-view__context-item--danger"
                onClick={handleDelete}
              >
                <img src={iconTrash} className="files-view__context-icon" alt="" />
                {t('files.contextMenu.deleteItem')}
              </div>
            </>
          ) : (
            <>
              <div
                className="files-view__context-item"
                onClick={() => {
                  setModalType('create');
                  setContextMenu(null);
                }}
              >
                <div className="files-view__context-spacer"></div>
                {t('files.contextMenu.newCreate')}
              </div>
              <div
                className="files-view__context-item"
                onClick={() => {
                  handleImport();
                  setContextMenu(null);
                }}
              >
                <div className="files-view__context-spacer"></div>
                {t('files.contextMenu.import')}
              </div>
              <div
                className="files-view__context-item"
                onClick={() => {
                  openMoveModal(true);
                  setContextMenu(null);
                }}
              >
                <img src={iconMove} className="files-view__context-icon" alt="" />
                {t('files.contextMenu.move')}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
