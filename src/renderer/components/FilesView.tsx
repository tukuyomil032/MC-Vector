import { useState, useEffect } from 'react';
import type * as React from 'react';
import Editor from '@monaco-editor/react';
import { type MinecraftServer } from '../components/../shared/server declaration';
import { useToast } from './ToastProvider';
import {
  listFilesWithMetadata,
  readFileContent,
  saveFileContent,
  deleteItem,
  createFolder,
  importFilesDialog,
  moveItem,
  compressItem,
  extractItem,
  openInFinder,
} from '../../lib/file-commands';
import { getServerRoot } from '../../lib/config-commands';

import iconFolder from '../../assets/icons/folder.svg';
import iconFile from '../../assets/icons/file.svg';
import iconOpenLocation from '../../assets/icons/open-folder.svg';
import iconMove from '../../assets/icons/move.svg';
import iconZip from '../../assets/icons/zip.svg';
import iconUnzip from '../../assets/icons/unzip.svg';
import iconTrash from '../../assets/icons/trash.svg';
import iconFiles from '../../assets/icons/files.svg';
import iconImport from '../../assets/icons/import.svg';

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

  const loadFiles = async (path: string) => {
    try {
      const entries = await listFilesWithMetadata(path);
      setFiles(entries);
    } catch (e) {
      console.error('Failed to list files', e);
    }
  };

  const renderBreadcrumbs = () => {
    if (!serversRootAbsPath) return <span className="font-mono">Loading...</span>;

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
      <div className="flex items-center font-mono text-zinc-300">
        <span
          className="cursor-pointer px-1 py-0.5 rounded hover:bg-zinc-800 hover:text-white hover:underline"
          onClick={() => setCurrentPath(normalizedRoot)}
        >
          servers
        </span>

        {segments.map((seg, index) => {
          const pathUpToHere = `${normalizedRoot}/${segments.slice(0, index + 1).join('/')}`;
          const normalizedServerPath = server.path.replace(/\\/g, '/');
          const isWithinServerPath = pathUpToHere.startsWith(normalizedServerPath);

          return (
            <span key={index} className="flex items-center">
              <span className="mx-1.5 text-zinc-600">/</span>
              <span
                className={`cursor-pointer px-1 py-0.5 rounded hover:bg-zinc-800 hover:text-white hover:underline ${!isWithinServerPath ? 'opacity-50 cursor-not-allowed' : ''}`}
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
    if (!target) return;

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
    if (currentPath === server.path) return;
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
    if (!editingFile) return;
    setIsSaving(true);
    try {
      await saveFileContent(`${currentPath}/${editingFile}`, fileContent);
      showToast('保存しました', 'success');
    } catch (err) {
      console.error(err);
      showToast('保存に失敗しました', 'error');
    }
    setIsSaving(false);
    setIsEditorOpen(false);
    setEditingFile(null);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isSave = (e.metaKey || e.ctrlKey) && e.key === 's';
      if (!isSave) return;
      if (!isEditorOpen) return;
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
    if (selectedFiles.length === 0) return;
    const { ask } = await import('@tauri-apps/plugin-dialog');
    const confirmed = await ask(`${selectedFiles.length}個の項目を削除しますか？`, {
      title: 'ファイル削除',
      kind: 'warning',
    });
    if (!confirmed) return;

    try {
      for (const name of selectedFiles) {
        await deleteItem(`${currentPath}/${name}`);
      }
      showToast('削除しました', 'success');
      setSelectedFiles([]);
      loadFiles(currentPath);
      setContextMenu(null);
    } catch (e) {
      console.error(e);
      showToast('削除に失敗しました', 'error');
    }
  };

  const handleCreate = async () => {
    if (!newFileName) return;
    const target = `${currentPath}/${newFileName}`;

    try {
      if (createMode === 'folder') {
        await createFolder(currentPath, newFileName);
      } else {
        await saveFileContent(target, '');
      }
      showToast('作成しました', 'success');
      setModalType(null);
      setNewFileName('');
      loadFiles(currentPath);
    } catch (e) {
      console.error(e);
      showToast('作成に失敗しました', 'error');
    }
  };

  const handleImport = async () => {
    setModalType(null);
    const result = await importFilesDialog(currentPath);

    if (result.length > 0) {
      loadFiles(currentPath);
      showToast('インポートしました', 'success');
    }
  };

  const handleMove = async () => {
    if (!moveDestPath) return;

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
      showToast('移動しました', 'success');
      setModalType(null);
    } catch (e) {
      console.error(e);
      showToast('移動に失敗しました', 'error');
    }
  };

  const openMoveModal = (isCurrentDir: boolean) => {
    const displayPath = getDisplayPath(isCurrentDir ? currentPath : currentPath);
    setMoveDestPath(displayPath);
    setModalType(isCurrentDir ? 'moveCurrent' : 'move');
  };

  const handleRename = async () => {
    if (!renameFileName || !contextMenu?.file) return;
    const src = `${currentPath}/${contextMenu.file.name}`;
    const dest = `${currentPath}/${renameFileName}`;
    try {
      await moveItem(src, dest);
      showToast('名前を変更しました', 'success');
      setModalType(null);
      setRenameFileName('');
      loadFiles(currentPath);
    } catch (e) {
      console.error(e);
      showToast('名前の変更に失敗しました', 'error');
    }
  };

  const handleZip = async () => {
    if (selectedFiles.length === 0) return;
    const targets = selectedFiles.map((f) => `${currentPath}/${f}`);
    const dest = `${currentPath}/archive-${Date.now()}.zip`;
    try {
      await compressItem(targets, dest);
      showToast('圧縮しました', 'success');
      loadFiles(currentPath);
      setContextMenu(null);
    } catch (e) {
      console.error(e);
      showToast('圧縮に失敗しました', 'error');
    }
  };

  const handleUnzip = async () => {
    if (selectedFiles.length === 0) return;
    try {
      for (const f of selectedFiles) {
        if (f.endsWith('.zip')) {
          await extractItem(`${currentPath}/${f}`, currentPath);
        }
      }
      showToast('解凍しました', 'success');
      loadFiles(currentPath);
      setContextMenu(null);
    } catch (e) {
      console.error(e);
      showToast('解凍に失敗しました', 'error');
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
    } catch {
      // Ignore drag-drop errors
    }
  };

  return (
    <div className="h-full flex flex-col text-zinc-300" onClick={() => setContextMenu(null)}>
      {/* ツールバー */}
      <div className="py-2.5 px-5 border-b border-zinc-800 flex items-center gap-2.5 bg-[#252526]">
        <button
          className="bg-transparent border-none cursor-pointer text-zinc-400 p-1.5 rounded hover:bg-zinc-800 hover:text-white disabled:opacity-50"
          onClick={handleGoUp}
          disabled={currentPath === server.path}
          title="上の階層へ"
        >
          ⬆
        </button>

        {/* パンくずリスト */}
        <div className="flex-1 bg-[#1e1e1e] px-2.5 py-1.5 rounded overflow-x-auto whitespace-nowrap">
          {renderBreadcrumbs()}
        </div>

        <button
          className="bg-transparent border-none cursor-pointer text-zinc-400 p-1.5 rounded hover:bg-zinc-800 hover:text-white"
          onClick={() => setModalType('create')}
          title="新規作成 / インポート"
        >
          +
        </button>
        <button
          className="bg-transparent border-none cursor-pointer text-zinc-400 p-1.5 rounded hover:bg-zinc-800 hover:text-white"
          onClick={handleOpenExplorer}
          title="エクスプローラーで開く"
        >
          <img src={iconOpenLocation} className="w-4" alt="Open" />
        </button>
        {selectedFiles.length > 0 && (
          <>
            <div className="w-px h-5 bg-zinc-700 mx-1.5"></div>
            <button
              className="bg-transparent border-none cursor-pointer text-zinc-400 p-1.5 rounded hover:bg-zinc-800 hover:text-white"
              onClick={() => openMoveModal(false)}
              title="移動"
            >
              <img src={iconMove} className="w-4" alt="Move" />
            </button>
            <button
              className="bg-transparent border-none cursor-pointer text-zinc-400 p-1.5 rounded hover:bg-zinc-800 hover:text-white"
              onClick={handleZip}
              title="圧縮"
            >
              <img src={iconZip} className="w-4" alt="Zip" />
            </button>
            <button
              className="bg-transparent border-none cursor-pointer text-zinc-400 p-1.5 rounded hover:bg-zinc-800 hover:text-white"
              onClick={handleUnzip}
              title="解凍"
            >
              <img src={iconUnzip} className="w-4" alt="Unzip" />
            </button>
            <button
              className="bg-transparent border-none cursor-pointer text-zinc-400 p-1.5 rounded hover:bg-red-500/20 hover:text-red-400"
              onClick={handleDelete}
              title="削除"
            >
              <img src={iconTrash} className="w-4" alt="Delete" />
            </button>
          </>
        )}
      </div>

      {/* ファイルリスト表示エリア */}
      <div
        className="flex-1 overflow-y-auto p-0 bg-[#1e1e1e]"
        onContextMenu={(e) => handleContextMenu(e, null)}
      >
        <div className="flex flex-col gap-0">
          {files.map((file) => (
            <div
              key={file.name}
              className={`flex items-center p-2.5 bg-transparent border-b border-zinc-800 cursor-pointer user-select-none last:border-b-0 hover:bg-zinc-800/50 ${selectedFiles.includes(file.name) ? 'bg-zinc-900/50' : ''}`}
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
                onChange={() => {}}
                onClick={(e) => handleCheckboxClick(file.name, e)}
                className="cursor-pointer mr-2.5 ml-2.5"
              />
              <img
                src={file.isDirectory ? iconFolder : iconFile}
                alt={file.isDirectory ? 'Folder' : 'File'}
                className="w-5 h-5 object-contain mr-2.5"
              />
              <span
                className={`flex-1 ${file.isDirectory ? 'font-bold text-accent' : 'font-normal text-text-primary'} whitespace-nowrap overflow-hidden text-ellipsis`}
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
          {files.length === 0 && (
            <div className="p-5 text-center text-text-secondary">フォルダは空です</div>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 bg-[#1e1e1e] z-2000 flex flex-col">
          <div className="p-2.5 bg-[#252526] flex justify-between items-center">
            <span>{editingFile}</span>
            <div>
              <button className="btn-secondary mr-2.5" onClick={() => setIsEditorOpen(false)}>
                閉じる
              </button>
              <button
                className="btn-primary disabled:opacity-50"
                onClick={handleSaveFile}
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : '保存'}
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
        <div className="fixed inset-0 bg-black/60 z-1000 flex justify-center items-center">
          <div className="bg-[#252526] p-6 rounded-xl w-[450px] border border-[#3e3e42] text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            <h3 className="mt-0 mb-5 text-xl border-b border-zinc-700 pb-2.5">
              新規作成 / インポート
            </h3>

            <div className="grid grid-cols-3 gap-2.5 mb-2.5">
              <div
                className={`flex flex-col items-center justify-center gap-2 p-5 rounded-lg cursor-pointer transition-all ${createMode === 'folder' ? 'border-2 border-accent bg-accent/15 text-white' : 'border-2 border-transparent bg-zinc-800 text-zinc-400'}`}
                onClick={() => setCreateMode('folder')}
              >
                <img src={iconFiles} alt="Folder" className="w-8 h-8 object-contain" />
                <span
                  className={`text-sm ${createMode === 'folder' ? 'font-bold' : 'font-normal'}`}
                >
                  フォルダ
                </span>
              </div>

              <div
                className={`flex flex-col items-center justify-center gap-2 p-5 rounded-lg cursor-pointer transition-all ${createMode === 'file' ? 'border-2 border-accent bg-accent/15 text-white' : 'border-2 border-transparent bg-zinc-800 text-zinc-400'}`}
                onClick={() => setCreateMode('file')}
              >
                <img src={iconFile} alt="File" className="w-8 h-8 object-contain" />
                <span className={`text-sm ${createMode === 'file' ? 'font-bold' : 'font-normal'}`}>
                  ファイル
                </span>
              </div>

              <div
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-lg cursor-pointer transition-all border-2 border-transparent bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                onClick={handleImport}
              >
                <img src={iconImport} alt="Import" className="w-8 h-8 object-contain" />
                <span className="text-sm">インポート</span>
              </div>
            </div>

            <label className="block text-zinc-400 text-sm">名前:</label>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={createMode === 'folder' ? '新しいフォルダ名' : '新しいファイル名.txt'}
              className="w-full p-2.5 mt-4 mb-5 bg-[#1e1e1e] border border-zinc-700 text-white rounded-md text-base box-border"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />

            <div className="flex justify-end gap-2.5 mt-2.5">
              <button
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-lg border border-zinc-700 bg-transparent text-zinc-300 cursor-pointer text-sm font-bold hover:bg-zinc-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 rounded-lg border-none bg-accent text-white cursor-pointer text-sm font-bold hover:bg-accent-hover disabled:opacity-50"
                disabled={!newFileName}
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {(modalType === 'move' || modalType === 'moveCurrent') && (
        <div className="fixed inset-0 bg-black/60 z-1000 flex justify-center items-center">
          <div className="bg-[#252526] p-6 rounded-xl w-[450px] border border-[#3e3e42] text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            <h3 className="mt-0 mb-5 text-xl border-b border-zinc-700 pb-2.5">
              {modalType === 'moveCurrent' ? 'ディレクトリの移動' : '移動'}
            </h3>
            <p className="text-zinc-400 text-sm mb-2.5">
              {modalType === 'moveCurrent'
                ? '現在のディレクトリ全体を移動します。'
                : `選択した ${selectedFiles.length} 個の項目を移動します。`}
            </p>
            <input
              type="text"
              value={moveDestPath}
              onChange={(e) => setMoveDestPath(e.target.value)}
              placeholder="移動先のパス (例: servers/myserver/plugins)"
              className="w-full p-2.5 mt-4 mb-5 bg-[#1e1e1e] border border-zinc-700 text-white rounded-md text-base box-border"
            />
            <div className="flex justify-end gap-2.5 mt-2.5">
              <button
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-lg border border-zinc-700 bg-transparent text-zinc-300 cursor-pointer text-sm font-bold hover:bg-zinc-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleMove}
                className="px-4 py-2 rounded-lg border-none bg-accent text-white cursor-pointer text-sm font-bold hover:bg-accent-hover"
              >
                移動
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {modalType === 'rename' && (
        <div className="fixed inset-0 bg-black/60 z-1000 flex justify-center items-center">
          <div className="bg-[#252526] p-6 rounded-xl w-[450px] border border-[#3e3e42] text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            <h3 className="mt-0 mb-5 text-xl border-b border-zinc-700 pb-2.5">名前の変更</h3>
            <input
              type="text"
              value={renameFileName}
              onChange={(e) => setRenameFileName(e.target.value)}
              className="w-full p-2.5 mt-4 mb-5 bg-[#1e1e1e] border border-zinc-700 text-white rounded-md text-base box-border"
              autoFocus
            />
            <div className="flex justify-end gap-2.5 mt-2.5">
              <button
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-lg border border-zinc-700 bg-transparent text-zinc-300 cursor-pointer text-sm font-bold hover:bg-zinc-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleRename}
                className="px-4 py-2 rounded-lg border-none bg-accent text-white cursor-pointer text-sm font-bold hover:bg-accent-hover"
              >
                変更
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu (機能追加・画像付き) */}
      {contextMenu && (
        <div
          className="fixed bg-[#252526] border border-zinc-700 rounded-md shadow-[0_4px_10px_rgba(0,0,0,0.5)] z-3000 min-w-[180px] p-1"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.file ? (
            <>
              {/* 1. 名前の変更 (画像なしのため透明なスペースで位置合わせ) */}
              <div
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm rounded hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  setRenameFileName(contextMenu.file!.name);
                  setModalType('rename');
                  setContextMenu(null);
                }}
              >
                <div className="w-4 h-4 inline-block"></div>
                名前の変更
              </div>

              {/* 2. アイテムを移動 */}
              <div
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm rounded hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  openMoveModal(false);
                  setContextMenu(null);
                }}
              >
                <img src={iconMove} className="w-4 h-4 object-contain" alt="" />
                アイテムを移動...
              </div>

              {/* 3. アイテムを圧縮 */}
              <div
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm rounded hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  handleZip();
                  setContextMenu(null);
                }}
              >
                <img src={iconZip} className="w-4 h-4 object-contain" alt="" />
                アイテムを圧縮
              </div>

              {/* 4. アイテムを解凍 */}
              <div
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm rounded hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  handleUnzip();
                  setContextMenu(null);
                }}
              >
                <img src={iconUnzip} className="w-4 h-4 object-contain" alt="" />
                アイテムを解凍
              </div>

              {/* 5. アイテムを削除 */}
              <div
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm rounded hover:bg-red-500 hover:text-white transition-colors"
                onClick={handleDelete}
              >
                <img src={iconTrash} className="w-4 h-4 object-contain" alt="" />
                アイテムを削除
              </div>
            </>
          ) : (
            <>
              <div
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm rounded hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  setModalType('create');
                  setContextMenu(null);
                }}
              >
                <div className="w-4 h-4 inline-block"></div>
                新規作成...
              </div>
              <div
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm rounded hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  handleImport();
                  setContextMenu(null);
                }}
              >
                <div className="w-4 h-4 inline-block"></div>
                インポート...
              </div>
              <div
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm rounded hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  openMoveModal(true);
                  setContextMenu(null);
                }}
              >
                <img src={iconMove} className="w-4 h-4 object-contain" alt="" />
                移動...
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
