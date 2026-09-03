import { DiffEditor } from '@monaco-editor/react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';
import { ArrowUp, FolderPlus, GitCompareArrows, X } from 'lucide-react';
import type * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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
import { logError } from '../../lib/error-utils';
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
import type { MinecraftServer } from '../components/../shared/server declaration';
import FileEditorWorkspace from './FileEditorWorkspace';
import SvgMaskIcon from './SvgMaskIcon';
import { Button } from './ui/Button';
import { Input } from './ui/Field';

interface Props {
  server: MinecraftServer;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size?: number;
}

interface EditingFileState {
  name: string;
  path: string;
}

const WINDOWS_DRIVE_ROOT = /^[A-Za-z]:\/$/;

function normalizeManagedPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/') && !WINDOWS_DRIVE_ROOT.test(normalized)) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function joinManagedPath(...segments: string[]): string {
  return normalizeManagedPath(segments.filter(Boolean).join('/'));
}

function detectLanguage(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  const map: Record<string, string> = {
    '.json': 'json',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.properties': 'ini',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.rs': 'rust',
    '.sh': 'shell',
    '.bash': 'shell',
    '.toml': 'toml',
    '.xml': 'xml',
    '.md': 'markdown',
    '.conf': 'ini',
    '.cfg': 'ini',
    '.txt': 'plaintext',
    '.log': 'plaintext',
    '.bat': 'bat',
    '.cmd': 'bat',
    '.py': 'python',
    '.lua': 'lua',
    '.sql': 'sql',
    '.css': 'css',
    '.html': 'html',
    '.htm': 'html',
    '.mcmeta': 'json',
    '.nbt': 'plaintext',
    '.dat': 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

export default function FilesView({ server }: Props) {
  const [currentPath, setCurrentPath] = useState(server.path);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [serversRootAbsPath, setServersRootAbsPath] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const [editingFile, setEditingFile] = useState<EditingFileState | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalFileContent, setOriginalFileContent] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEditorLoading, setIsEditorLoading] = useState(false);
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

  const [diffMode, setDiffMode] = useState(false);
  const [diffOriginal, setDiffOriginal] = useState<{ path: string; content: string } | null>(null);
  const [diffModified, setDiffModified] = useState<{ path: string; content: string } | null>(null);
  const [diffSelectStep, setDiffSelectStep] = useState<'original' | 'modified' | null>(null);
  const editorRequestId = useRef(0);
  const filesRequestId = useRef(0);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (type === 'success') {
      toast.success(msg);
    } else if (type === 'error') {
      toast.error(msg);
    } else {
      toast(msg);
    }
  };
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
          logError('Failed to import dropped files', error, {
            currentPath,
            pathCount: payload.paths.length,
          });
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
  }, [currentPath, t]);

  const loadFiles = async (path: string) => {
    const requestId = filesRequestId.current + 1;
    filesRequestId.current = requestId;
    try {
      const entries = await listFilesWithMetadata(path);
      if (requestId !== filesRequestId.current) {
        return;
      }
      setFiles(entries);
    } catch (e) {
      if (requestId !== filesRequestId.current) {
        return;
      }
      logError('Failed to list files', e, { path });
      showToast(t('files.toast.loadFailed'), 'error');
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
        <button
          type="button"
          className="files-view__breadcrumb-link"
          onClick={() => setCurrentPath(normalizedRoot)}
        >
          {t('nav.servers')}
        </button>

        {segments.map((seg, index) => {
          const pathUpToHere = `${normalizedRoot}/${segments.slice(0, index + 1).join('/')}`;
          const normalizedServerPath = server.path.replace(/\\/g, '/');
          const isWithinServerPath = pathUpToHere.startsWith(normalizedServerPath);

          return (
            <span key={index} className="flex items-center">
              <span className="files-view__breadcrumb-separator">/</span>
              <button
                type="button"
                className={`files-view__breadcrumb-link ${!isWithinServerPath ? 'files-view__breadcrumb-link--disabled' : ''}`}
                onClick={() => {
                  if (isWithinServerPath) {
                    setCurrentPath(pathUpToHere);
                  }
                }}
              >
                {seg}
              </button>
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
      const requestId = editorRequestId.current + 1;
      editorRequestId.current = requestId;
      setIsEditorLoading(true);
      try {
        const filePath = joinManagedPath(currentPath, fileName);
        const content = await readFileContent(filePath);
        if (requestId !== editorRequestId.current) {
          return;
        }
        setEditingFile({ name: fileName, path: filePath });
        setFileContent(content);
        setOriginalFileContent(content);
        setIsEditorOpen(true);
      } catch (e) {
        logError('Failed to read file', e, {
          currentPath,
          fileName,
        });
        showToast(t('files.toast.readFailed'), 'error');
      } finally {
        if (requestId === editorRequestId.current) {
          setIsEditorLoading(false);
        }
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

  const handleSaveFile = useCallback(async () => {
    if (!editingFile || isSaving || fileContent === originalFileContent) {
      return;
    }
    setIsSaving(true);
    try {
      await saveFileContent(editingFile.path, fileContent);
      setOriginalFileContent(fileContent);
      showToast(t('files.toast.saved'), 'success');
    } catch (err) {
      console.error('Failed to save file content', {
        currentPath,
        filePath: editingFile.path,
        error: err,
      });
      showToast(t('files.toast.saveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  }, [currentPath, editingFile, fileContent, isSaving, originalFileContent, t]);

  const handleCloseEditor = useCallback(async () => {
    if (!editingFile || isSaving) {
      return;
    }

    if (fileContent !== originalFileContent) {
      const discard = await ask(t('files.confirm.discardChanges'), {
        title: t('files.confirm.discardChangesTitle'),
        kind: 'warning',
      });
      if (!discard) {
        return;
      }
    }

    setIsEditorOpen(false);
    setEditingFile(null);
    setFileContent('');
    setOriginalFileContent('');
  }, [editingFile, fileContent, isSaving, originalFileContent, t]);

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
      void handleSaveFile();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSaveFile, isEditorOpen]);

  const BINARY_EXTENSIONS = [
    'jar',
    'zip',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'ico',
    'exe',
    'dll',
    'class',
  ];

  const handleDiffSelect = async (file: FileEntry, filePath: string) => {
    if (!diffSelectStep) {
      return;
    }
    const ext = file.name.split('.').at(-1)?.toLowerCase() ?? '';
    if (BINARY_EXTENSIONS.includes(ext)) {
      showToast(t('files.toast.binaryNoDiff'), 'error');
      return;
    }
    const content = await readFileContent(filePath);
    if (diffSelectStep === 'original') {
      setDiffOriginal({ path: filePath, content });
      setDiffSelectStep('modified');
      showToast(t('files.toast.diffSelectModified'), 'info');
    } else {
      setDiffModified({ path: filePath, content });
      setDiffSelectStep(null);
      setDiffMode(true);
    }
  };

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
      logError('Failed to delete selected files', e, {
        currentPath,
        selectedFiles,
      });
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
      logError('Failed to create filesystem entry', e, {
        target,
        createMode,
      });
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
      logError('Failed to move filesystem entries', e, {
        currentPath,
        destination: realDest,
        selectedFiles,
        modalType,
      });
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
      logError('Failed to rename filesystem entry', e, {
        sourcePath: src,
        targetPath: dest,
      });
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
      logError('Failed to compress selected entries', e, {
        currentPath,
        targets,
        destination: dest,
      });
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
      logError('Failed to extract selected archives', e, {
        currentPath,
        selectedFiles,
      });
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
      logError('Failed to move entry via drag and drop', e, {
        currentPath,
        folderName,
      });
      showToast(t('files.toast.moveFailed'), 'error');
    }
  };

  return (
    <div
      className="files-view flex h-full flex-col gap-4 p-5 max-[900px]:p-4"
      data-testid="files-view"
      onClick={() => setContextMenu(null)}
    >
      {/* ツールバー */}
      <div className="files-view__toolbar">
        <button
          type="button"
          className="files-view__toolbar-btn"
          onClick={handleGoUp}
          disabled={currentPath === server.path}
          aria-label={t('files.toolbar.goUp')}
          title={t('files.toolbar.goUp')}
        >
          <ArrowUp aria-hidden="true" className="files-view__toolbar-icon" size={16} />
        </button>

        {/* パンくずリスト */}
        <div className="files-view__breadcrumb-shell">{renderBreadcrumbs()}</div>

        <button
          type="button"
          className="files-view__toolbar-btn"
          data-testid="files-create-button"
          onClick={() => setModalType('create')}
          aria-label={t('files.toolbar.createImport')}
          title={t('files.toolbar.createImport')}
        >
          <FolderPlus aria-hidden="true" className="files-view__toolbar-icon" size={16} />
        </button>
        <button
          type="button"
          className="files-view__toolbar-btn"
          onClick={handleOpenExplorer}
          aria-label={t('files.toolbar.openExplorer')}
          title={t('files.toolbar.openExplorer')}
        >
          <SvgMaskIcon src={iconOpenFolder} className="files-view__toolbar-icon" />
        </button>
        <button
          type="button"
          className={`files-view__toolbar-btn${diffSelectStep ? ' is-active' : ''}`}
          onClick={() => {
            if (diffMode) {
              setDiffMode(false);
              setDiffOriginal(null);
              setDiffModified(null);
            } else if (diffSelectStep) {
              setDiffSelectStep(null);
            } else {
              setDiffSelectStep('original');
              showToast(t('files.toast.diffSelectOriginal'), 'info');
            }
          }}
          aria-label={diffMode ? t('files.toolbar.diffClose') : t('files.toolbar.diffOpen')}
          title={diffMode ? t('files.toolbar.diffClose') : t('files.toolbar.diffOpen')}
        >
          <GitCompareArrows aria-hidden="true" className="files-view__toolbar-icon" size={16} />
          <span className="sr-only">
            {diffMode ? t('files.toolbar.diffClose') : t('files.toolbar.diffOpen')}
          </span>
        </button>
        {selectedFiles.length > 0 && (
          <>
            <div className="files-view__toolbar-divider" />
            <button
              type="button"
              className="files-view__toolbar-btn"
              onClick={() => openMoveModal(false)}
              aria-label={t('files.toolbar.move')}
              title={t('files.toolbar.move')}
            >
              <SvgMaskIcon src={iconMove} className="files-view__toolbar-icon" />
            </button>
            <button
              type="button"
              className="files-view__toolbar-btn"
              onClick={handleZip}
              aria-label={t('files.toolbar.compress')}
              title={t('files.toolbar.compress')}
            >
              <SvgMaskIcon src={iconZip} className="files-view__toolbar-icon" />
            </button>
            <button
              type="button"
              className="files-view__toolbar-btn"
              onClick={handleUnzip}
              aria-label={t('files.toolbar.extract')}
              title={t('files.toolbar.extract')}
            >
              <SvgMaskIcon src={iconUnzip} className="files-view__toolbar-icon" />
            </button>
            <button
              type="button"
              className="files-view__toolbar-btn files-view__toolbar-btn--danger"
              onClick={handleDelete}
              aria-label={t('files.toolbar.delete')}
              title={t('files.toolbar.delete')}
            >
              <SvgMaskIcon src={iconTrash} className="files-view__toolbar-icon" />
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
          {files.map((file) => {
            const filePath = joinManagedPath(currentPath, file.name);
            return (
              <div
                key={file.name}
                className={`files-view__row ${selectedFiles.includes(file.name) ? 'is-selected' : ''}${diffSelectStep && !file.isDirectory ? ' cursor-crosshair' : ''}`}
                data-testid={`file-row-${file.name}`}
                role="button"
                tabIndex={0}
                aria-label={file.name}
                aria-pressed={selectedFiles.includes(file.name)}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, file);
                }}
                onClick={(e) => {
                  if (diffSelectStep && !file.isDirectory) {
                    void handleDiffSelect(file, filePath);
                  } else {
                    handleRowClick(file.name, e);
                  }
                }}
                onDoubleClick={() => !diffSelectStep && handleFileDoubleClick(file.name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (diffSelectStep && !file.isDirectory) {
                      void handleDiffSelect(file, filePath);
                    } else {
                      void handleFileDoubleClick(file.name);
                    }
                  }
                }}
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
                  aria-label={file.name}
                  onClick={(e) => handleCheckboxClick(file.name, e)}
                  className="cursor-pointer mr-2.5 ml-2.5"
                />
                <SvgMaskIcon
                  src={file.isDirectory ? iconFolder : iconFile}
                  className={`files-view__row-icon ${file.isDirectory ? 'files-view__row-icon--dir' : 'files-view__row-icon--file'}`}
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
                      ? `${(file.size / 1024).toFixed(1)} KB`
                      : '0 KB'}
                </span>
              </div>
            );
          })}
          {files.length === 0 && <div className="files-view__empty">{t('files.emptyFolder')}</div>}
        </div>
      </div>

      {/* Diff View Overlay */}
      {diffMode && diffOriginal && diffModified && (
        <div className="files-view__editor-overlay" aria-label={t('files.toolbar.diffOpen')}>
          <div className="files-view__editor-header">
            <div className="files-view__editor-identity">
              <span className="files-view__editor-file-icon" aria-hidden="true">
                <GitCompareArrows size={18} strokeWidth={1.8} />
              </span>
              <div className="files-view__editor-file-meta">
                <div className="files-view__editor-file-title">
                  <strong>
                    {diffOriginal.path.split(/[\\/]/).at(-1)}
                    {' → '}
                    {diffModified.path.split(/[\\/]/).at(-1)}
                  </strong>
                </div>
                <span className="files-view__editor-file-path">{t('files.toolbar.diffOpen')}</span>
              </div>
            </div>
            <div className="files-view__editor-actions">
              <button
                type="button"
                className="files-view__editor-icon-button"
                onClick={() => {
                  setDiffMode(false);
                  setDiffOriginal(null);
                  setDiffModified(null);
                }}
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                <X aria-hidden="true" size={18} strokeWidth={1.8} />
                {t('common.close')}
              </button>
            </div>
          </div>
          <DiffEditor
            height="100%"
            original={diffOriginal.content}
            modified={diffModified.content}
            language={detectLanguage(diffModified.path.split(/[\\/]/).at(-1) ?? '')}
            theme="vs-dark"
            options={{ readOnly: true, minimap: { enabled: false }, renderSideBySide: true }}
          />
          <div className="files-view__editor-statusbar" aria-live="polite">
            <span>{detectLanguage(diffModified.path.split(/[\\/]/).at(-1) ?? '')}</span>
            <span>{t('files.editor.readOnly')}</span>
          </div>
        </div>
      )}

      {/* Editor Modal */}
      {isEditorLoading && (
        <div
          className="files-view__editor-overlay files-view__editor-overlay--loading"
          aria-busy="true"
        >
          <div className="files-view__editor-loading">{t('files.loading')}</div>
        </div>
      )}
      {isEditorOpen && editingFile && !isEditorLoading && (
        <FileEditorWorkspace
          file={editingFile}
          content={fileContent}
          language={detectLanguage(editingFile.name)}
          isDirty={fileContent !== originalFileContent}
          isSaving={isSaving}
          onChange={setFileContent}
          onSave={() => void handleSaveFile()}
          onClose={() => void handleCloseEditor()}
          t={t}
        />
      )}

      {/* New Create / Import Modal */}
      {modalType === 'create' && (
        <div className="mc-modal-overlay modal-backdrop">
          <div className="mc-modal-panel modal-panel files-view__modal-panel">
            <h3 className="mt-0 mb-5 text-xl border-b border-zinc-700 pb-2.5">
              {t('files.modal.createImportTitle')}
            </h3>

            <div className="files-view__create-grid">
              <div
                className={`files-view__create-option ${createMode === 'folder' ? 'is-active' : ''}`}
                onClick={() => setCreateMode('folder')}
                role="button"
                tabIndex={0}
                aria-pressed={createMode === 'folder'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setCreateMode('folder');
                  }
                }}
              >
                <SvgMaskIcon src={iconFiles} className="w-8 h-8" />
                <span
                  className={`files-view__create-option-label ${createMode === 'folder' ? 'is-active' : 'is-idle'}`}
                >
                  {t('files.modal.folder')}
                </span>
              </div>

              <div
                className={`files-view__create-option ${createMode === 'file' ? 'is-active' : ''}`}
                onClick={() => setCreateMode('file')}
                role="button"
                tabIndex={0}
                aria-pressed={createMode === 'file'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setCreateMode('file');
                  }
                }}
              >
                <SvgMaskIcon src={iconFile} className="w-8 h-8" />
                <span
                  className={`files-view__create-option-label ${createMode === 'file' ? 'is-active' : 'is-idle'}`}
                >
                  {t('files.modal.file')}
                </span>
              </div>

              <div
                className="files-view__create-option files-view__create-option--import"
                onClick={handleImport}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void handleImport();
                  }
                }}
              >
                <SvgMaskIcon src={iconImport} className="w-8 h-8" />
                <span className="files-view__create-option-label is-idle">
                  {t('files.modal.import')}
                </span>
              </div>
            </div>

            <label className="files-view__modal-label">{t('files.modal.nameLabel')}</label>
            <Input
              type="text"
              value={newFileName}
              data-testid="files-name-input"
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={
                createMode === 'folder'
                  ? t('files.modal.newFolderPlaceholder')
                  : t('files.modal.newFilePlaceholder')
              }
              variant="modal"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />

            <div className="flex justify-end gap-2.5 mt-2.5">
              <Button variant="modalSecondary" onClick={() => setModalType(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleCreate}
                variant="modalPrimary"
                data-testid="files-create-submit"
                disabled={!newFileName}
              >
                {t('common.create')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {(modalType === 'move' || modalType === 'moveCurrent') && (
        <div className="mc-modal-overlay modal-backdrop">
          <div className="mc-modal-panel modal-panel files-view__modal-panel">
            <h3 className="mt-0 mb-5 text-xl border-b border-zinc-700 pb-2.5">
              {modalType === 'moveCurrent'
                ? t('files.modal.moveDirectoryTitle')
                : t('files.modal.moveTitle')}
            </h3>
            <p className="text-zinc-400 text-sm mb-2.5">
              {modalType === 'moveCurrent'
                ? t('files.modal.moveDirectoryDescription')
                : t('files.modal.moveDescription', { count: selectedFiles.length })}
            </p>
            <Input
              type="text"
              value={moveDestPath}
              data-testid="files-move-input"
              onChange={(e) => setMoveDestPath(e.target.value)}
              placeholder={t('files.modal.moveDestPlaceholder')}
              variant="modal"
            />
            <div className="flex justify-end gap-2.5 mt-2.5">
              <Button variant="modalSecondary" onClick={() => setModalType(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="modalPrimary" onClick={handleMove}>
                {t('files.modal.moveButton')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {modalType === 'rename' && (
        <div className="mc-modal-overlay modal-backdrop">
          <div className="mc-modal-panel modal-panel files-view__modal-panel">
            <h3 className="mt-0 mb-5 text-xl border-b border-zinc-700 pb-2.5">
              {t('files.modal.renameTitle')}
            </h3>
            <Input
              type="text"
              value={renameFileName}
              onChange={(e) => setRenameFileName(e.target.value)}
              variant="modal"
            />
            <div className="flex justify-end gap-2.5 mt-2.5">
              <Button variant="modalSecondary" onClick={() => setModalType(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="modalPrimary" onClick={handleRename}>
                {t('files.modal.renameButton')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu (機能追加・画像付き) */}
      {contextMenu && (
        <div
          className="files-view__context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setContextMenu(null);
            } else if (e.key === 'Enter' || e.key === ' ') {
              const target = e.target;
              if (target instanceof HTMLElement && target !== e.currentTarget) {
                e.preventDefault();
                target.click();
              }
            }
          }}
        >
          {contextMenu.file ? (
            <>
              {/* 1. 名前の変更 (画像なしのため透明なスペースで位置合わせ) */}
              <div
                className="files-view__context-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => {
                  setRenameFileName(contextMenu.file?.name ?? '');
                  setModalType('rename');
                  setContextMenu(null);
                }}
              >
                <div className="files-view__context-spacer" />
                {t('files.contextMenu.rename')}
              </div>

              {/* 2. アイテムを移動 */}
              <div
                className="files-view__context-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => {
                  openMoveModal(false);
                  setContextMenu(null);
                }}
              >
                <SvgMaskIcon src={iconMove} className="files-view__context-icon" />
                {t('files.contextMenu.moveItem')}
              </div>

              {/* 3. アイテムを圧縮 */}
              <div
                className="files-view__context-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => {
                  handleZip();
                  setContextMenu(null);
                }}
              >
                <SvgMaskIcon src={iconZip} className="files-view__context-icon" />
                {t('files.contextMenu.compressItem')}
              </div>

              {/* 4. アイテムを解凍 */}
              <div
                className="files-view__context-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => {
                  handleUnzip();
                  setContextMenu(null);
                }}
              >
                <SvgMaskIcon src={iconUnzip} className="files-view__context-icon" />
                {t('files.contextMenu.extractItem')}
              </div>

              {/* 5. アイテムを削除 */}
              <div
                className="files-view__context-item files-view__context-item--danger"
                role="menuitem"
                tabIndex={0}
                onClick={handleDelete}
              >
                <SvgMaskIcon src={iconTrash} className="files-view__context-icon" />
                {t('files.contextMenu.deleteItem')}
              </div>
            </>
          ) : (
            <>
              <div
                className="files-view__context-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => {
                  setModalType('create');
                  setContextMenu(null);
                }}
              >
                <div className="files-view__context-spacer" />
                {t('files.contextMenu.newCreate')}
              </div>
              <div
                className="files-view__context-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => {
                  handleImport();
                  setContextMenu(null);
                }}
              >
                <div className="files-view__context-spacer" />
                {t('files.contextMenu.import')}
              </div>
              <div
                className="files-view__context-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => {
                  openMoveModal(true);
                  setContextMenu(null);
                }}
              >
                <SvgMaskIcon src={iconMove} className="files-view__context-icon" />
                {t('files.contextMenu.move')}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
