import { DiffEditor } from '@monaco-editor/react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Archive,
  ArrowUp,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  GitCompareArrows,
  Move,
  PackageOpen,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type * as React from 'react';
import { Breadcrumb, type BreadcrumbItem } from '@/components/arc/breadcrumb/breadcrumb';
import { ButtonGroup, type ButtonGroupItem } from '@/components/arc/button-group/button-group';
import { Checkbox } from '@/components/arc/checkbox/checkbox';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notify } from '../shared/notify';
import { useAppFeedback } from './AppFeedbackProvider';
import { iconFiles, iconImport, iconMove, iconTrash, iconUnzip, iconZip } from '../../assets/icons';
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
import styles from './FilesView.module.css';
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

  const { t, locale } = useTranslation();
  const { confirm } = useAppFeedback();
  const sizeFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  );

  useEffect(() => {
    const loadRoot = async () => {
      const root = await getServerRoot();
      setServersRootAbsPath(root.replace(/\\/g, '/'));
    };
    loadRoot();
  }, []);

  // loadFiles is a render-local async helper; this effect is keyed by the current path.
  useEffect(() => {
    loadFiles(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  // The drag/drop subscription is keyed by the path and translation function it uses.
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
            notify.success(t('files.toast.uploadSuccess', { count: imported.length }));
            await loadFiles(currentPath);
          }
        } catch (error) {
          logError('Failed to import dropped files', error, {
            currentPath,
            pathCount: payload.paths.length,
          });
          notify.error(t('files.toast.uploadFailed'));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      notify.error(t('files.toast.loadFailed'));
    }
  };

  const renderBreadcrumbs = () => {
    if (!serversRootAbsPath) {
      return <span className={styles.loading}>{t('files.loading')}</span>;
    }

    const normalizedCurrent = currentPath.replace(/\\/g, '/');
    const normalizedRoot = serversRootAbsPath.replace(/\\/g, '/');

    // A path outside the servers root has no crumbs to click, so the raw path is shown as-is.
    if (!normalizedCurrent.startsWith(normalizedRoot)) {
      return <code className={styles.rawPath}>{currentPath}</code>;
    }

    const normalizedServerPath = server.path.replace(/\\/g, '/');
    const segments = normalizedCurrent.substring(normalizedRoot.length).split('/').filter(Boolean);
    const items: BreadcrumbItem[] = [
      { label: t('nav.servers'), onClick: () => setCurrentPath(normalizedRoot) },
    ];
    let path = normalizedRoot;
    for (const segment of segments) {
      path = `${path}/${segment}`;
      const target = path;
      // Crumbs above the server folder stay as plain text, so the user cannot leave the server.
      const isWithinServerPath = target.startsWith(normalizedServerPath);
      items.push({
        label: segment,
        onClick: isWithinServerPath ? () => setCurrentPath(target) : undefined,
      });
    }

    return <Breadcrumb ariaLabel={t('files.breadcrumb.label')} items={items} />;
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
        notify.error(t('files.toast.readFailed'));
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
      notify.success(t('files.toast.saved'));
    } catch (err) {
      console.error('Failed to save file content', {
        currentPath,
        filePath: editingFile.path,
        error: err,
      });
      notify.error(t('files.toast.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [currentPath, editingFile, fileContent, isSaving, originalFileContent, t]);

  const handleCloseEditor = useCallback(async () => {
    if (!editingFile || isSaving) {
      return;
    }

    if (fileContent !== originalFileContent) {
      const discard = await confirm({
        title: t('files.confirm.discardChangesTitle'),
        description: t('files.confirm.discardChanges'),
        confirmLabel: t('files.confirm.discardButton'),
        tone: 'danger',
      });
      if (!discard) {
        return;
      }
    }

    setIsEditorOpen(false);
    setEditingFile(null);
    setFileContent('');
    setOriginalFileContent('');
  }, [confirm, editingFile, fileContent, isSaving, originalFileContent, t]);

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
      notify.error(t('files.toast.binaryNoDiff'));
      return;
    }
    const content = await readFileContent(filePath);
    if (diffSelectStep === 'original') {
      setDiffOriginal({ path: filePath, content });
      setDiffSelectStep('modified');
      notify.info(t('files.toast.diffSelectModified'));
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
    const confirmed = await confirm({
      title: t('files.confirm.deleteTitle'),
      description: t('files.confirm.delete', { count: selectedFiles.length }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }

    try {
      for (const name of selectedFiles) {
        await deleteItem(`${currentPath}/${name}`);
      }
      notify.success(t('files.toast.deleted'));
      setSelectedFiles([]);
      loadFiles(currentPath);
      setContextMenu(null);
    } catch (e) {
      logError('Failed to delete selected files', e, {
        currentPath,
        selectedFiles,
      });
      notify.error(t('files.toast.deleteFailed'));
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
      notify.success(t('files.toast.created'));
      setModalType(null);
      setNewFileName('');
      loadFiles(currentPath);
    } catch (e) {
      logError('Failed to create filesystem entry', e, {
        target,
        createMode,
      });
      notify.error(t('files.toast.createFailed'));
    }
  };

  const handleImport = async () => {
    setModalType(null);
    const result = await importFilesDialog(currentPath);

    if (result.length > 0) {
      loadFiles(currentPath);
      notify.success(t('files.toast.imported'));
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
      notify.success(t('files.toast.moved'));
      setModalType(null);
    } catch (e) {
      logError('Failed to move filesystem entries', e, {
        currentPath,
        destination: realDest,
        selectedFiles,
        modalType,
      });
      notify.error(t('files.toast.moveFailed'));
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
      notify.success(t('files.toast.renamed'));
      setModalType(null);
      setRenameFileName('');
      loadFiles(currentPath);
    } catch (e) {
      logError('Failed to rename filesystem entry', e, {
        sourcePath: src,
        targetPath: dest,
      });
      notify.error(t('files.toast.renameFailed'));
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
      notify.success(t('files.toast.compressed'));
      loadFiles(currentPath);
      setContextMenu(null);
    } catch (e) {
      logError('Failed to compress selected entries', e, {
        currentPath,
        targets,
        destination: dest,
      });
      notify.error(t('files.toast.compressFailed'));
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
      notify.success(t('files.toast.extracted'));
      loadFiles(currentPath);
      setContextMenu(null);
    } catch (e) {
      logError('Failed to extract selected archives', e, {
        currentPath,
        selectedFiles,
      });
      notify.error(t('files.toast.extractFailed'));
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
      notify.error(t('files.toast.moveFailed'));
    }
  };

  // The diff button has three states: idle, picking the original, and a diff that is open.
  const diffActive = diffMode || diffSelectStep !== null;
  const diffToolbarLabel = diffMode
    ? t('files.toolbar.diffClose')
    : diffSelectStep
      ? t('files.toolbar.diffCancel')
      : t('files.toolbar.diffOpen');
  const toggleDiff = () => {
    if (diffMode) {
      setDiffMode(false);
      setDiffOriginal(null);
      setDiffModified(null);
    } else if (diffSelectStep) {
      setDiffSelectStep(null);
    } else {
      setDiffSelectStep('original');
      notify.info(t('files.toast.diffSelectOriginal'));
    }
  };

  const upItems: ButtonGroupItem[] = [
    {
      id: 'up',
      label: t('files.toolbar.goUp'),
      icon: <ArrowUp aria-hidden="true" size={16} strokeWidth={1.75} />,
      iconOnly: true,
      disabled: currentPath === server.path,
      onSelect: handleGoUp,
    },
  ];
  const toolItems: ButtonGroupItem[] = [
    {
      id: 'create',
      label: t('files.toolbar.createImport'),
      icon: <FolderPlus aria-hidden="true" size={16} strokeWidth={1.75} />,
      iconOnly: true,
      onSelect: () => setModalType('create'),
    },
    {
      id: 'explorer',
      label: t('files.toolbar.openExplorer'),
      icon: <FolderOpen aria-hidden="true" size={16} strokeWidth={1.75} />,
      iconOnly: true,
      onSelect: handleOpenExplorer,
    },
    {
      id: 'diff',
      label: diffToolbarLabel,
      icon: diffActive ? (
        <X aria-hidden="true" size={16} strokeWidth={1.75} />
      ) : (
        <GitCompareArrows aria-hidden="true" size={16} strokeWidth={1.75} />
      ),
      iconOnly: true,
      onSelect: toggleDiff,
    },
  ];
  const selectionItems: ButtonGroupItem[] = [
    {
      id: 'move',
      label: t('files.toolbar.move'),
      icon: <Move aria-hidden="true" size={16} strokeWidth={1.75} />,
      iconOnly: true,
      onSelect: () => openMoveModal(false),
    },
    {
      id: 'compress',
      label: t('files.toolbar.compress'),
      icon: <Archive aria-hidden="true" size={16} strokeWidth={1.75} />,
      iconOnly: true,
      onSelect: () => void handleZip(),
    },
    {
      id: 'extract',
      label: t('files.toolbar.extract'),
      icon: <PackageOpen aria-hidden="true" size={16} strokeWidth={1.75} />,
      iconOnly: true,
      onSelect: () => void handleUnzip(),
    },
    {
      id: 'delete',
      label: t('files.toolbar.delete'),
      icon: <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />,
      iconOnly: true,
      onSelect: () => void handleDelete(),
    },
  ];

  return (
    <div className={styles.view} data-testid="files-view" onClick={() => setContextMenu(null)}>
      <div className={styles.toolbar}>
        <ButtonGroup label={t('files.toolbar.navigation')} size="sm" items={upItems} />
        <div className={styles.breadcrumbShell}>{renderBreadcrumbs()}</div>
        <div className={styles.toolbarEnd}>
          <ButtonGroup label={t('files.toolbar.tools')} size="sm" items={toolItems} />
          {selectedFiles.length > 0 && (
            <ButtonGroup label={t('files.toolbar.selection')} size="sm" items={selectionItems} />
          )}
        </div>
      </div>

      {/* ファイルリスト表示エリア */}
      <div
        className={`${styles.pane}${isExternalDropActive ? ` ${styles.paneDropActive}` : ''}`}
        onContextMenu={(e) => handleContextMenu(e, null)}
      >
        {isExternalDropActive && (
          <div className={styles.dropOverlay} role="status">
            <Upload aria-hidden="true" size={24} strokeWidth={1.75} />
            <span>{t('files.dropHint')}</span>
          </div>
        )}

        {files.length === 0 ? (
          <EmptyState
            icon={<FolderOpen aria-hidden="true" size={22} strokeWidth={1.75} />}
            title={t('files.emptyFolder')}
            description={t('files.emptyFolderHint')}
          />
        ) : (
          <div className={styles.list}>
            {files.map((file) => {
              const filePath = joinManagedPath(currentPath, file.name);
              const selected = selectedFiles.includes(file.name);
              const rowClass = [
                styles.row,
                selected ? styles.rowSelected : '',
                diffSelectStep && !file.isDirectory ? styles.rowPick : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={file.name}
                  className={rowClass}
                  data-testid={`file-row-${file.name}`}
                  role="button"
                  tabIndex={0}
                  aria-label={file.name}
                  aria-pressed={selected}
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
                  {/* The checkbox handles its own presses, so they do not also open or select the row. */}
                  <span
                    className={styles.checkCell}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      aria-label={file.name}
                      checked={selected}
                      onCheckedChange={() => toggleSelect(file.name)}
                    />
                  </span>
                  {file.isDirectory ? (
                    <Folder
                      aria-hidden="true"
                      className={`${styles.icon} ${styles.iconDirectory}`}
                      size={16}
                      strokeWidth={1.75}
                    />
                  ) : (
                    <File aria-hidden="true" className={styles.icon} size={16} strokeWidth={1.75} />
                  )}
                  <span className={styles.name}>{file.name}</span>
                  <span className={styles.size}>
                    {file.isDirectory
                      ? '-'
                      : t('files.size.kb', {
                          value: sizeFormatter.format((file.size ?? 0) / 1024),
                        })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
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
                data-testid="files-create-file-option"
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
                data-testid="files-import-button"
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
