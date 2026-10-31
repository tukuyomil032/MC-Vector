import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Archive,
  ArrowUp,
  File,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Move,
  PackageOpen,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import type * as React from 'react';
import { Breadcrumb, type BreadcrumbItem } from '@/components/arc/breadcrumb/breadcrumb';
import { Button } from '@/components/arc/button/button';
import { ButtonGroup, type ButtonGroupItem } from '@/components/arc/button-group/button-group';
import { Checkbox } from '@/components/arc/checkbox/checkbox';
import { ContextMenu, type ContextMenuItem } from '@/components/arc/context-menu/context-menu';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { EmptyLine } from './ui/EmptyLine';
import { Input } from '@/components/arc/input/input';
import { RadioCards, type RadioCardOption } from '@/components/arc/radio-cards/radio-cards';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBytes } from '../shared/format-bytes';
import { notify } from '../shared/notify';
import { useAppFeedback } from './AppFeedbackProvider';
import { useTranslation } from '../../i18n';
import { getServerRoot } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';
import {
  compressItem,
  createFolder,
  deleteItem,
  extractItem,
  getManagedDirectorySize,
  importFilesDialog,
  importFilesFromPaths,
  listFilesWithMetadata,
  type ManagedDirectorySize,
  moveItem,
  openInFinder,
  readFileContent,
  saveFileContent,
} from '../../lib/file-commands';
import type { MinecraftServer } from '../components/../shared/server declaration';
import FileEditorWorkspace, {
  MAX_EDITABLE_MEGABYTES,
  type UnsupportedReason,
} from './FileEditorWorkspace';
import styles from './FilesView.module.css';

interface Props {
  server: MinecraftServer;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size?: number;
}

type CreateMode = 'folder' | 'file' | 'import';

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

// Extensions that are never opened as text in the editor.
const BINARY_EXTENSIONS = ['jar', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'ico', 'exe', 'dll', 'class'];

const MAX_EDITABLE_BYTES = MAX_EDITABLE_MEGABYTES * 1024 * 1024;

/** Says why a file cannot be opened in the editor, or returns null. It is checked before the file is read. */
function getUnsupportedReason(
  fileName: string,
  size: number | undefined,
): UnsupportedReason | null {
  const ext = fileName.includes('.') ? (fileName.split('.').at(-1) ?? '').toLowerCase() : '';
  if (BINARY_EXTENSIONS.includes(ext)) {
    return 'binary';
  }
  if ((size ?? 0) > MAX_EDITABLE_BYTES) {
    return 'large';
  }
  return null;
}

/** Folder sizes measured this session, by managed path. Only successful walks are kept, so a failed folder is measured again later. */
const folderSizeCache = new Map<string, ManagedDirectorySize>();
/** Folders measured at once. Each walk runs on a blocking thread, so a small number keeps the listing responsive. */
const FOLDER_SIZE_CONCURRENCY = 2;

/** A folder's measured size, or 'failed' when the walk could not run. */
type FolderSizeResult = ManagedDirectorySize | 'failed';

/** The folder-size cell: an ellipsis while the walk runs, a dash when it failed, and a plus when it stopped early. */
function folderSizeLabel(result: FolderSizeResult | undefined, locale: string): string {
  if (result === undefined) {
    return '…';
  }
  if (result === 'failed') {
    return '—';
  }
  return `${formatBytes(result.bytes, locale)}${result.complete ? '' : '+'}`;
}

/**
 * Measures the folders of one listing in the background, a few at a time, and reports each result as it lands.
 * A new listing stops the walks still queued for the old one, so a result never lands on the wrong listing.
 */
function useFolderSizes(folderKey: string): ReadonlyMap<string, FolderSizeResult> {
  const [results, setResults] = useState<ReadonlyMap<string, FolderSizeResult>>(() => new Map());

  useEffect(() => {
    const queue = folderKey.split('\n').filter((path) => path !== '' && !folderSizeCache.has(path));
    if (queue.length === 0) {
      return;
    }
    let current = true;
    const measureNext = async () => {
      let path = queue.shift();
      while (path !== undefined && current) {
        const target = path;
        try {
          const size = await getManagedDirectorySize(target);
          folderSizeCache.set(target, size);
          if (current) setResults((prev) => new Map(prev).set(target, size));
        } catch (error) {
          logError('Failed to measure folder size', error, { path: target });
          if (current) setResults((prev) => new Map(prev).set(target, 'failed'));
        }
        path = queue.shift();
      }
    };
    for (let slot = 0; slot < Math.min(FOLDER_SIZE_CONCURRENCY, queue.length); slot += 1) {
      void measureNext();
    }
    return () => {
      current = false;
    };
  }, [folderKey]);

  return results;
}

export default function FilesView({ server }: Props) {
  const [currentPath, setCurrentPath] = useState(server.path);
  const [files, setFiles] = useState<FileEntry[]>([]);
  // The folder that `files` was listed from. It lags `currentPath` until the new listing arrives.
  const [listedPath, setListedPath] = useState('');
  const [serversRootAbsPath, setServersRootAbsPath] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const [editingFile, setEditingFile] = useState<EditingFileState | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalFileContent, setOriginalFileContent] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEditorLoading, setIsEditorLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExternalDropActive, setIsExternalDropActive] = useState(false);
  const [editorUnsupported, setEditorUnsupported] = useState<UnsupportedReason | null>(null);

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [modalType, setModalType] = useState<string | null>(null);

  const [newFileName, setNewFileName] = useState('');
  const [createMode, setCreateMode] = useState<CreateMode>('folder');

  const [moveDestPath, setMoveDestPath] = useState('');
  const [renameFileName, setRenameFileName] = useState('');

  const editorRequestId = useRef(0);
  const filesRequestId = useRef(0);

  const { t, locale } = useTranslation();
  const { confirm } = useAppFeedback();
  const folderKey = files
    .filter((file) => file.isDirectory)
    .map((file) => joinManagedPath(listedPath, file.name))
    .join('\n');
  const folderSizeResults = useFolderSizes(folderKey);

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
      setListedPath(path);
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
      const unsupported = getUnsupportedReason(fileName, target.size);
      if (unsupported) {
        // The file is not read at all. The editor shows why instead of loading garbage text.
        setEditingFile({ name: fileName, path: joinManagedPath(currentPath, fileName) });
        setFileContent('');
        setOriginalFileContent('');
        setEditorUnsupported(unsupported);
        setIsEditorOpen(true);
        return;
      }
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
        setEditorUnsupported(null);
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
    setEditorUnsupported(null);
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

  // Turns the typed destination into an absolute path. A leading "servers/" is relative to the servers root.
  const resolveMoveDestination = (input: string): string => {
    const normalizedRoot = serversRootAbsPath.replace(/\\/g, '/');
    let dest = input.trim().replace(/\\/g, '/');
    if (dest.startsWith('servers/')) {
      dest = dest.replace('servers', normalizedRoot);
    }
    return dest.replace(/\/+/g, '/');
  };

  const handleMove = async () => {
    const realDest = resolveMoveDestination(moveDestPath);
    if (!realDest || moveDestinationError) {
      return;
    }

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
    if (!renameFileName || !renameTarget) {
      return;
    }
    const src = `${currentPath}/${renameTarget}`;
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
    // Only .zip archives can be extracted. Anything else is reported instead of counting as a success.
    const archives = selectedFiles.filter((name) => name.toLowerCase().endsWith('.zip'));
    if (archives.length === 0) {
      notify.error(t('files.toast.extractNotZip'));
      return;
    }
    try {
      for (const archive of archives) {
        await extractItem(`${currentPath}/${archive}`, currentPath);
      }
      const skipped = selectedFiles.length - archives.length;
      if (skipped > 0) {
        notify.warning(t('files.toast.extractSkipped', { count: skipped }));
      } else {
        notify.success(t('files.toast.extracted'));
      }
      loadFiles(currentPath);
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

  const createOptions: RadioCardOption[] = [
    {
      value: 'folder',
      label: t('files.modal.folder'),
      icon: <Folder aria-hidden="true" size={16} strokeWidth={1.75} />,
      testId: 'files-create-folder-option',
    },
    {
      value: 'file',
      label: t('files.modal.file'),
      icon: <File aria-hidden="true" size={16} strokeWidth={1.75} />,
      testId: 'files-create-file-option',
    },
    {
      value: 'import',
      label: t('files.modal.import'),
      icon: <FolderInput aria-hidden="true" size={16} strokeWidth={1.75} />,
      testId: 'files-import-button',
    },
  ];
  const createNameError =
    createMode !== 'import' && /[\\/]/.test(newFileName) ? t('files.modal.nameInvalid') : undefined;
  const createDisabled =
    createMode !== 'import' && (!newFileName.trim() || createNameError !== undefined);
  const submitCreate = () => {
    if (createMode === 'import') {
      void handleImport();
      return;
    }
    if (!createDisabled) {
      void handleCreate();
    }
  };

  // A folder cannot be moved into itself or into one of its own subfolders.
  const moveSources =
    modalType === 'moveCurrent'
      ? [currentPath]
      : selectedFiles.map((name) => `${currentPath}/${name}`);
  const resolvedMoveDestination = resolveMoveDestination(moveDestPath);
  const moveDestinationError = moveSources.some(
    (source) =>
      resolvedMoveDestination === source || resolvedMoveDestination.startsWith(`${source}/`),
  )
    ? t('files.modal.moveIntoItself')
    : undefined;
  const moveDisabled = !moveDestPath.trim() || moveDestinationError !== undefined;

  const renameError = /[\\/]/.test(renameFileName) ? t('files.modal.nameInvalid') : undefined;
  const renameDisabled =
    !renameFileName.trim() || renameFileName.trim() === renameTarget || renameError !== undefined;

  const rowMenuItems = (file: FileEntry): ContextMenuItem[] => [
    {
      id: 'rename',
      label: t('files.contextMenu.rename'),
      icon: <Pencil aria-hidden="true" size={16} strokeWidth={1.75} />,
      onSelect: () => {
        setRenameTarget(file.name);
        setRenameFileName(file.name);
        setModalType('rename');
      },
    },
    {
      id: 'move',
      label: t('files.contextMenu.moveItem'),
      icon: <Move aria-hidden="true" size={16} strokeWidth={1.75} />,
      onSelect: () => openMoveModal(false),
    },
    {
      id: 'compress',
      label: t('files.contextMenu.compressItem'),
      icon: <Archive aria-hidden="true" size={16} strokeWidth={1.75} />,
      onSelect: () => void handleZip(),
    },
    {
      id: 'extract',
      label: t('files.contextMenu.extractItem'),
      icon: <PackageOpen aria-hidden="true" size={16} strokeWidth={1.75} />,
      onSelect: () => void handleUnzip(),
    },
    {
      id: 'delete',
      label: t('files.contextMenu.deleteItem'),
      icon: <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />,
      destructive: true,
      onSelect: () => void handleDelete(),
    },
  ];
  const emptyAreaMenuItems: ContextMenuItem[] = [
    {
      id: 'create',
      label: t('files.contextMenu.newCreate'),
      icon: <FolderPlus aria-hidden="true" size={16} strokeWidth={1.75} />,
      onSelect: () => setModalType('create'),
    },
    {
      id: 'import',
      label: t('files.contextMenu.import'),
      icon: <FolderInput aria-hidden="true" size={16} strokeWidth={1.75} />,
      onSelect: () => void handleImport(),
    },
    {
      id: 'move',
      label: t('files.contextMenu.move'),
      icon: <Move aria-hidden="true" size={16} strokeWidth={1.75} />,
      onSelect: () => openMoveModal(true),
    },
  ];

  return (
    <div className={styles.view} data-testid="files-view">
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
      <div className={`${styles.pane}${isExternalDropActive ? ` ${styles.paneDropActive}` : ''}`}>
        {isExternalDropActive && (
          <div className={styles.dropOverlay} role="status">
            <Upload aria-hidden="true" size={24} strokeWidth={1.75} />
            <span>{t('files.dropHint')}</span>
          </div>
        )}

        {files.length === 0 ? (
          <EmptyLine title={t('files.emptyFolder')} />
        ) : (
          <div className={styles.list}>
            {files.map((file) => {
              const filePath = joinManagedPath(listedPath, file.name);
              const selected = selectedFiles.includes(file.name);
              const rowClass = [styles.row, selected ? styles.rowSelected : '']
                .filter(Boolean)
                .join(' ');
              return (
                <ContextMenu
                  key={file.name}
                  label={file.name}
                  items={rowMenuItems(file)}
                  trigger="context"
                  className={styles.item}
                >
                  <div
                    className={rowClass}
                    data-testid={`file-row-${file.name}`}
                    role="button"
                    tabIndex={0}
                    aria-label={file.name}
                    aria-pressed={selected}
                    onContextMenu={() => {
                      if (!selected) setSelectedFiles([file.name]);
                    }}
                    onClick={(e) => handleRowClick(file.name, e)}
                    onDoubleClick={() => handleFileDoubleClick(file.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void handleFileDoubleClick(file.name);
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
                      <File
                        aria-hidden="true"
                        className={styles.icon}
                        size={16}
                        strokeWidth={1.75}
                      />
                    )}
                    <span className={styles.name}>{file.name}</span>
                    <span className={styles.size}>
                      {file.isDirectory
                        ? folderSizeLabel(
                            folderSizeCache.get(filePath) ?? folderSizeResults.get(filePath),
                            locale,
                          )
                        : formatBytes(file.size ?? 0, locale)}
                    </span>
                  </div>
                </ContextMenu>
              );
            })}
          </div>
        )}

        {/* The empty space below the rows opens the folder menu, so it never overlaps a row's own menu. */}
        <ContextMenu
          label={t('files.contextMenu.label')}
          items={emptyAreaMenuItems}
          trigger="context"
          className={styles.emptyArea}
        >
          <div className={styles.emptyAreaFill} />
        </ContextMenu>
      </div>

      {/* Shown while the file is read, before the editor opens */}
      {isEditorLoading && (
        <section className={styles.overlay} aria-busy="true" aria-label={t('files.loading')}>
          <div className={styles.loadingPanel} role="status">
            <span className={styles.loadingBar} aria-hidden="true" />
            {t('files.loading')}
          </div>
        </section>
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
          unsupported={editorUnsupported}
          t={t}
        />
      )}

      {/* Create / Import: one choice card per action, and the name only when it is needed */}
      <Dialog
        open={modalType === 'create'}
        onOpenChange={(open) => {
          if (!open) setModalType(null);
        }}
      >
        <DialogContent
          title={t('files.modal.createImportTitle')}
          width="min(560px, calc(100vw - 2rem))"
          data-testid="files-create-modal"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setModalType(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                data-testid="files-create-submit"
                disabled={createDisabled}
                onClick={submitCreate}
              >
                {createMode === 'import' ? t('files.modal.import') : t('common.create')}
              </Button>
            </>
          }
        >
          <div className={styles.createBody}>
            {/* Three fixed columns: auto-fill can open an empty fourth column in a wide dialog and squeeze the cards. */}
            <RadioCards
              aria-label={t('files.modal.createImportTitle')}
              layout="grid"
              style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
              options={createOptions}
              value={createMode}
              onValueChange={(value) => setCreateMode(value as CreateMode)}
            />
            {createMode !== 'import' && (
              <Input
                label={t('files.modal.nameLabel')}
                data-testid="files-name-input"
                value={newFileName}
                placeholder={
                  createMode === 'folder'
                    ? t('files.modal.newFolderPlaceholder')
                    : t('files.modal.newFilePlaceholder')
                }
                error={createNameError}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitCreate();
                  }
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Move: the destination is checked before Move is enabled */}
      <Dialog
        open={modalType === 'move' || modalType === 'moveCurrent'}
        onOpenChange={(open) => {
          if (!open) setModalType(null);
        }}
      >
        <DialogContent
          title={
            modalType === 'moveCurrent'
              ? t('files.modal.moveDirectoryTitle')
              : t('files.modal.moveTitle')
          }
          description={
            modalType === 'moveCurrent'
              ? t('files.modal.moveDirectoryDescription')
              : t('files.modal.moveDescription', { count: selectedFiles.length })
          }
          data-testid="files-move-modal"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setModalType(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                data-testid="files-move-submit"
                disabled={moveDisabled}
                onClick={() => void handleMove()}
              >
                {t('files.modal.moveButton')}
              </Button>
            </>
          }
        >
          <Input
            label={t('files.modal.moveDestLabel')}
            data-testid="files-move-input"
            value={moveDestPath}
            placeholder={t('files.modal.moveDestPlaceholder')}
            error={moveDestinationError}
            onChange={(e) => setMoveDestPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !moveDisabled) {
                e.preventDefault();
                void handleMove();
              }
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Rename: the name must differ from the current one and must not contain a slash */}
      <Dialog
        open={modalType === 'rename'}
        onOpenChange={(open) => {
          if (!open) setModalType(null);
        }}
      >
        <DialogContent
          title={t('files.modal.renameTitle')}
          data-testid="files-rename-modal"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setModalType(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                data-testid="files-rename-submit"
                disabled={renameDisabled}
                onClick={() => void handleRename()}
              >
                {t('files.modal.renameButton')}
              </Button>
            </>
          }
        >
          <Input
            label={t('files.modal.renameLabel')}
            data-testid="files-rename-input"
            value={renameFileName}
            error={renameError}
            onChange={(e) => setRenameFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !renameDisabled) {
                e.preventDefault();
                void handleRename();
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
