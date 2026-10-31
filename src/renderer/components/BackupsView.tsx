import { useVirtualizer } from '@tanstack/react-virtual';
import { Archive, Globe, Package } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { ChipGroup } from '@/components/arc/chip-group/chip-group';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { HoldToConfirm } from '@/components/arc/hold-to-confirm/hold-to-confirm';
import { Input } from '@/components/arc/input/input';
import { Select } from '@/components/arc/select/select';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { Textarea } from '@/components/arc/textarea/textarea';
import { useTranslation } from '../../i18n';
import {
  applyBackupRetention,
  createBackup,
  deleteBackup,
  getBackupNameValidationError,
  listBackupsWithMetadata,
  readBackupCatalog,
  restoreBackup,
  writeBackupCatalog,
} from '../../lib/backup-commands';
import { ESTIMATE_SAMPLE_COUNT, estimateBackupDurationMs } from '../../lib/backup-estimate';
import { logError } from '../../lib/error-utils';
import { deleteItem, getManagedDirectorySize, listFiles } from '../../lib/file-commands';
import { notify } from '../shared/notify';
import { formatBytes } from '../shared/format-bytes';
import { useArcMessages } from '../shared/arc-messages';
import { useAppFeedback } from './AppFeedbackProvider';
import { EmptyLine } from './ui/EmptyLine';
import { HintIcon } from './ui/FieldLabel';
import { SectionTitle } from './ui/IconTile';
import {
  getManualBackupOperationId,
  useBackupOperationStore,
} from '../../store/backupOperationStore';
import { buildManualBackupName } from '../shared/auto-backup';
import type { MinecraftServer } from '../shared/server declaration';
import styles from './BackupsView.module.css';

interface Props {
  server: MinecraftServer;
}

interface Backup {
  name: string;
  date: Date;
  size: number;
  durationMs?: number;
}

/** A folder size as the UI shows it. `failed` means the measurement itself did not succeed. */
type FolderSize =
  | { status: 'loading' }
  | { status: 'ready'; bytes: number; complete: boolean }
  | { status: 'failed' };

interface BackupSnapshotEntry {
  size: number;
  modified: number;
}

// Backups are always full snapshots of the whole server. Fields written by older
// builds (mode, parent, sourceCount) are ignored when the catalog is read.
interface BackupCatalogEntry {
  tags: string[];
  note: string;
  createdAt: string;
}

interface BackupCatalog {
  lastBackupName: string | null;
  latestSnapshot: Record<string, BackupSnapshotEntry>;
  entries: Record<string, BackupCatalogEntry>;
}

interface RetentionResult {
  catalog: BackupCatalog;
  deletedCount: number;
  failedDeleteCount: number;
  listingFailed: boolean;
}

type CatalogLoadState = 'loading' | 'ready' | 'error';

interface InitializationToken {
  key: string;
  generation: number;
}

interface DataReloadToken {
  initialization: InitializationToken;
  generation: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeBackupName(backupName: string): string {
  return backupName.endsWith('.zip') ? backupName : `${backupName}.zip`;
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
      tags,
      note: typeof entry.note === 'string' ? entry.note : '',
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
    };
  }

  return {
    lastBackupName: typeof value.lastBackupName === 'string' ? value.lastBackupName : null,
    latestSnapshot,
    entries,
  };
}

/** Measures a server or world folder. A failed walk comes back as `failed`, so one folder cannot break the view. */
async function measureFolder(path: string): Promise<FolderSize> {
  try {
    const result = await getManagedDirectorySize(path);
    return { status: 'ready', bytes: result.bytes, complete: result.complete };
  } catch (error) {
    logError('Failed to measure folder size', error, { path });
    return { status: 'failed' };
  }
}

const COMPRESSION_OPTIONS = Array.from({ length: 9 }, (_, index) => ({
  value: String(index + 1),
  label: String(index + 1),
}));

export async function persistBackupCatalogBestEffort(
  persist: () => Promise<void>,
  onFailure: (error: unknown) => void,
): Promise<boolean> {
  try {
    await persist();
    return true;
  } catch (error) {
    onFailure(error);
    return false;
  }
}

export default function BackupsView({ server }: Props) {
  const { t, locale } = useTranslation();
  const arc = useArcMessages();
  const { confirm } = useAppFeedback();
  const activeManualOperation = useBackupOperationStore(
    (state) => state.activeManualOperations[server.id],
  );
  const manualCompletionRevision = useBackupOperationStore(
    (state) => state.completionRevisions[server.id] ?? 0,
  );
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [compressionLevel, setCompressionLevel] = useState(5);
  const [backupCatalog, setBackupCatalog] = useState<BackupCatalog>(createEmptyCatalog());
  const [catalogLoadState, setCatalogLoadState] = useState<CatalogLoadState>('loading');
  const [worlds, setWorlds] = useState<string[]>([]);
  const [worldSizes, setWorldSizes] = useState<Record<string, FolderSize>>({});
  const [serverSize, setServerSize] = useState<FolderSize | null>(null);
  const worldSizeGenerationRef = useRef(0);
  const serverSizeGenerationRef = useRef(0);
  const [tagEditorTarget, setTagEditorTarget] = useState<string | null>(null);
  const [tagList, setTagList] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [restoringName, setRestoringName] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const catalogOperationInFlightRef = useRef(false);
  const initializationKey = `${server.id}\0${server.path}`;
  const initializationKeyRef = useRef<string | null>(null);
  const initializationGenerationRef = useRef(0);
  const dataReloadGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const pendingUnmountRef = useRef<symbol | null>(null);
  const observedManualCompletionRef = useRef({
    key: initializationKey,
    revision: manualCompletionRevision,
  });
  const getCurrentInitializationToken = useCallback((fallbackKey: string): InitializationToken => {
    return {
      key: fallbackKey,
      generation: initializationGenerationRef.current,
    };
  }, []);
  const isCurrentInitialization = useCallback((expectedToken: InitializationToken) => {
    return (
      mountedRef.current &&
      initializationKeyRef.current === expectedToken.key &&
      initializationGenerationRef.current === expectedToken.generation
    );
  }, []);
  const beginDataReload = useCallback(
    (initializationToken: InitializationToken): DataReloadToken | null => {
      if (!isCurrentInitialization(initializationToken)) {
        return null;
      }
      const token: DataReloadToken = {
        initialization: initializationToken,
        generation: dataReloadGenerationRef.current + 1,
      };
      dataReloadGenerationRef.current = token.generation;
      return token;
    },
    [isCurrentInitialization],
  );
  const getCurrentDataReloadToken = useCallback(
    (initializationToken: InitializationToken): DataReloadToken | null => {
      if (!isCurrentInitialization(initializationToken)) {
        return null;
      }
      return {
        initialization: initializationToken,
        generation: dataReloadGenerationRef.current,
      };
    },
    [isCurrentInitialization],
  );
  const isCurrentDataReload = useCallback(
    (expectedToken: DataReloadToken) => {
      return (
        isCurrentInitialization(expectedToken.initialization) &&
        dataReloadGenerationRef.current === expectedToken.generation
      );
    },
    [isCurrentInitialization],
  );
  const scheduleUnmountInvalidation = useCallback(() => {
    mountedRef.current = false;
    const marker = Symbol('backups-view-unmount');
    pendingUnmountRef.current = marker;
    queueMicrotask(() => {
      if (pendingUnmountRef.current !== marker || mountedRef.current) {
        return;
      }
      initializationKeyRef.current = null;
      initializationGenerationRef.current += 1;
      pendingUnmountRef.current = null;
    });
  }, []);
  const cleanupInitialization = useCallback(() => {
    scheduleUnmountInvalidation();
  }, [scheduleUnmountInvalidation]);
  const isManualBackupCreating = activeManualOperation?.kind === 'create';
  const isProcessing = processing || isManualBackupCreating;
  const beginCatalogOperation = () => {
    if (isProcessing || catalogOperationInFlightRef.current) {
      return false;
    }
    catalogOperationInFlightRef.current = true;
    setProcessing(true);
    return true;
  };
  const endCatalogOperation = () => {
    catalogOperationInFlightRef.current = false;
    setProcessing(false);
  };
  const listParentRef = useRef<HTMLDivElement>(null);
  const backupVirtualizer = useVirtualizer({
    count: backups.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

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

  // The initialization callbacks intentionally capture the current server lifecycle.
  useLayoutEffect(() => {
    mountedRef.current = true;
    pendingUnmountRef.current = null;
    if (initializationKeyRef.current === initializationKey) {
      return cleanupInitialization;
    }

    initializationKeyRef.current = initializationKey;
    const initializationToken: InitializationToken = {
      key: initializationKey,
      generation: initializationGenerationRef.current + 1,
    };
    initializationGenerationRef.current = initializationToken.generation;
    catalogOperationInFlightRef.current = false;
    setProcessing(false);
    setBackups([]);
    setWorlds([]);
    setWorldSizes({});
    setServerSize(null);
    setCatalogLoadState('loading');
    setBackupCatalog(createEmptyCatalog());
    setShowCreateModal(false);
    setTagEditorTarget(null);
    const dataReloadToken = beginDataReload(initializationToken);
    if (!dataReloadToken) {
      return cleanupInitialization;
    }
    void (async () => {
      await loadBackups(dataReloadToken);
      if (!isCurrentDataReload(dataReloadToken)) {
        return;
      }

      await loadBackupCatalog(dataReloadToken);
      if (!isCurrentDataReload(dataReloadToken)) {
        return;
      }

      await loadWorlds(initializationToken);
    })();
    return cleanupInitialization;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginDataReload, cleanupInitialization, initializationKey, isCurrentDataReload]);

  const persistBackupCatalog = async (catalog: BackupCatalog) => {
    await writeBackupCatalog(server.id, catalog);
  };

  const loadBackupCatalog = async (expectedToken: DataReloadToken) => {
    if (!isCurrentDataReload(expectedToken)) {
      return;
    }
    try {
      const value = await readBackupCatalog(server.id);
      if (!isCurrentDataReload(expectedToken)) {
        return;
      }
      setBackupCatalog(sanitizeCatalog(value));
      setCatalogLoadState('ready');
    } catch (error) {
      if (!isCurrentDataReload(expectedToken)) {
        return;
      }
      logError('Failed to load backup catalog', error, { serverPath: server.path });
      setCatalogLoadState('error');
      notify.error(t('backups.toast.catalogLoadFailed'));
    }
  };

  const retryCatalogLoad = async () => {
    const operationToken = getCurrentInitializationToken(initializationKey);
    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    const dataReloadToken = beginDataReload(operationToken);
    if (!dataReloadToken) {
      return;
    }
    setCatalogLoadState('loading');
    await loadBackupCatalog(dataReloadToken);
  };

  const loadBackups = async (expectedToken: DataReloadToken) => {
    if (!isCurrentDataReload(expectedToken)) {
      return;
    }
    setLoading(true);
    try {
      const list = await listBackupsWithMetadata(server.id);
      if (!isCurrentDataReload(expectedToken)) {
        return;
      }
      setBackups(list);
    } catch (e) {
      if (!isCurrentDataReload(expectedToken)) {
        return;
      }
      logError('Failed to load backups', e, { serverPath: server.path });
      notify.error(t('backups.toast.loadFailed'));
    } finally {
      if (isCurrentDataReload(expectedToken)) {
        setLoading(false);
      }
    }
  };

  const defaultName = () => {
    return buildManualBackupName(server);
  };

  // The create dialog shows the whole server folder's size, measured fresh each time it opens.
  const loadServerSize = (expectedToken: InitializationToken) => {
    const generation = ++serverSizeGenerationRef.current;
    setServerSize({ status: 'loading' });
    void measureFolder(server.path).then((size) => {
      if (serverSizeGenerationRef.current !== generation) return;
      if (!isCurrentInitialization(expectedToken)) return;
      setServerSize(size);
    });
  };

  const openCreateModal = () => {
    const operationToken = getCurrentInitializationToken(initializationKey);
    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    setShowCreateModal(true);
    setCustomName('');
    setCompressionLevel(5);
    loadServerSize(operationToken);
  };

  const loadWorlds = async (expectedToken: InitializationToken) => {
    if (!isCurrentInitialization(expectedToken)) {
      return;
    }
    try {
      const entries = await listFiles(server.path);
      if (!isCurrentInitialization(expectedToken)) {
        return;
      }
      const candidates = entries.filter(
        (entry) => entry.isDirectory && entry.name.toLowerCase() !== 'backups',
      );

      const worldNames: string[] = [];
      await Promise.all(
        candidates.map(async (candidate) => {
          if (!isCurrentInitialization(expectedToken)) {
            return;
          }
          try {
            const children = await listFiles(`${server.path}/${candidate.name}`);
            if (!isCurrentInitialization(expectedToken)) {
              return;
            }
            const hasLevelDat = children.some(
              (child) => !child.isDirectory && child.name === 'level.dat',
            );
            if (hasLevelDat || /^world($|[_-])/i.test(candidate.name)) {
              worldNames.push(candidate.name);
            }
          } catch (error) {
            if (!isCurrentInitialization(expectedToken)) {
              return;
            }
            logError('Failed to inspect world directory candidate', error, {
              serverPath: server.path,
              candidate: candidate.name,
            });
          }
        }),
      );

      const unique = Array.from(new Set(worldNames)).sort((a, b) => a.localeCompare(b));
      if (!isCurrentInitialization(expectedToken)) {
        return;
      }
      setWorlds(unique);
      // Sizes fill in after the list is shown. Each one is dropped if a newer listing has started since.
      const generation = ++worldSizeGenerationRef.current;
      setWorldSizes(
        Object.fromEntries(
          unique.map((name): [string, FolderSize] => [name, { status: 'loading' }]),
        ),
      );
      for (const name of unique) {
        void measureFolder(`${server.path}/${name}`).then((size) => {
          if (worldSizeGenerationRef.current !== generation) return;
          if (!isCurrentInitialization(expectedToken)) return;
          setWorldSizes((current) => (name in current ? { ...current, [name]: size } : current));
        });
      }
    } catch (error) {
      if (!isCurrentInitialization(expectedToken)) {
        return;
      }
      logError('Failed to load world candidates', error, { serverPath: server.path });
      setWorlds([]);
      notify.error(t('backups.toast.worldLoadFailed'));
    }
  };

  useEffect(() => {
    const observed = observedManualCompletionRef.current;
    if (observed.key !== initializationKey) {
      observedManualCompletionRef.current = {
        key: initializationKey,
        revision: manualCompletionRevision,
      };
      return;
    }
    if (observed.revision === manualCompletionRevision) {
      return;
    }

    observedManualCompletionRef.current = {
      key: initializationKey,
      revision: manualCompletionRevision,
    };
    const completionToken = getCurrentInitializationToken(initializationKey);
    if (!isCurrentInitialization(completionToken)) {
      return;
    }
    const dataReloadToken = beginDataReload(completionToken);
    if (!dataReloadToken) {
      return;
    }
    setCatalogLoadState('loading');

    void (async () => {
      await loadBackups(dataReloadToken);
      if (!isCurrentDataReload(dataReloadToken)) {
        return;
      }
      await loadBackupCatalog(dataReloadToken);
    })();
  }, [
    beginDataReload,
    getCurrentInitializationToken,
    initializationKey,
    isCurrentDataReload,
    isCurrentInitialization,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadBackupCatalog,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadBackups,
    manualCompletionRevision,
  ]);

  const getBackupMeta = (backupName: string): BackupCatalogEntry => {
    const existing = backupCatalog.entries[backupName];
    if (existing) {
      return existing;
    }
    return {
      tags: [],
      note: '',
      createdAt: '',
    };
  };

  const applyRetentionPolicy = async (
    catalog: BackupCatalog,
    srv: MinecraftServer,
  ): Promise<RetentionResult> => {
    const retainCount = srv.autoBackupRetainCount ?? 0;
    const retainDays = srv.autoBackupRetainDays ?? 0;
    const retention = await applyBackupRetention(srv.id, retainCount, retainDays);
    const { deletedNames } = retention;

    let updatedCatalog = catalog;
    if (deletedNames.length > 0) {
      const deletedNameSet = new Set(deletedNames);
      const updatedEntries = Object.fromEntries(
        Object.entries(catalog.entries).filter(([name]) => !deletedNameSet.has(name)),
      );
      const lastBackupDeleted =
        catalog.lastBackupName !== null && deletedNameSet.has(catalog.lastBackupName);
      updatedCatalog = {
        ...catalog,
        lastBackupName: lastBackupDeleted ? null : catalog.lastBackupName,
        latestSnapshot: lastBackupDeleted ? {} : catalog.latestSnapshot,
        entries: updatedEntries,
      };
    }

    return {
      catalog: updatedCatalog,
      deletedCount: deletedNames.length,
      failedDeleteCount: retention.failedDeleteCount,
      listingFailed: retention.listingFailed,
    };
  };

  const handleCreateBackup = async () => {
    const operationToken = getCurrentInitializationToken(initializationKey);
    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    if (isProcessing || catalogOperationInFlightRef.current) {
      return;
    }

    if (catalogLoadState !== 'ready') {
      notify.error(t('backups.toast.catalogLoadFailed'));
      return;
    }

    const capturedServer = { ...server };
    const capturedCatalog = backupCatalog;
    const capturedCompressionLevel = compressionLevel;
    const requestedName = customName.trim() || buildManualBackupName(capturedServer);
    const normalizedName = normalizeBackupName(requestedName);
    const nameValidationError = getBackupNameValidationError(normalizedName);
    if (nameValidationError) {
      notify.error(
        nameValidationError === 'empty'
          ? t('backups.toast.invalidNameEmpty')
          : t('backups.toast.invalidNameCharacters'),
      );
      return;
    }

    const operationId = getManualBackupOperationId(capturedServer.id);
    if (!beginCatalogOperation()) {
      return;
    }
    let manualOperationStarted = false;
    try {
      if (
        !useBackupOperationStore
          .getState()
          .beginManualOperation(capturedServer.id, operationId, 'create')
      ) {
        return;
      }
      manualOperationStarted = true;

      // Rust rechecks server state while holding the per-server operation lock.
      let backupOutcome = await createBackup(
        capturedServer.id,
        normalizedName,
        capturedCompressionLevel,
        false,
      );
      if (backupOutcome.status === 'confirmation_required') {
        const confirmed = await confirm({
          title: t('backups.stopForBackupTitle'),
          description: t('backups.confirmStopForBackup', { name: capturedServer.name }),
        });
        if (!confirmed) {
          return;
        }
        backupOutcome = await createBackup(
          capturedServer.id,
          normalizedName,
          capturedCompressionLevel,
          true,
        );
      }
      if (backupOutcome.status === 'confirmation_required') {
        notify.error(t('backups.toast.serverStopFailed'));
        return;
      }
      if (backupOutcome.status === 'failed') {
        logError('Manual backup operation failed', backupOutcome.error, {
          serverId: capturedServer.id,
          serverPath: capturedServer.path,
          stage: backupOutcome.stage,
          restartError: backupOutcome.restartError,
        });
        if (backupOutcome.restartError) {
          notify.error(
            t('backups.toast.backupNotCreatedRestartFailed', { name: capturedServer.name }),
          );
        } else {
          notify.error(
            backupOutcome.stage === 'stop'
              ? t('backups.toast.serverStopFailed')
              : t('backups.toast.stoppedCreateFailed'),
          );
        }
        return;
      }

      let refreshedBackups: Backup[] | null = null;
      try {
        refreshedBackups = await listBackupsWithMetadata(capturedServer.id);
      } catch (error) {
        logError('Failed to refresh backup list after creating backup', error, {
          serverPath: capturedServer.path,
          backupName: backupOutcome.backupName,
        });
      }
      if (refreshedBackups && isCurrentInitialization(operationToken)) {
        setBackups(refreshedBackups);
      }

      const currentMeta = capturedCatalog.entries[normalizedName] ?? {
        tags: [],
        note: '',
        createdAt: '',
      };
      const nextCatalog: BackupCatalog = {
        lastBackupName: normalizedName,
        latestSnapshot: {},
        entries: {
          ...capturedCatalog.entries,
          [normalizedName]: {
            ...currentMeta,
            createdAt: currentMeta.createdAt || new Date().toISOString(),
          },
        },
      };

      let finalCatalog = nextCatalog;
      let retentionResult: RetentionResult = {
        catalog: nextCatalog,
        deletedCount: 0,
        failedDeleteCount: 0,
        listingFailed: false,
      };
      // Retention cleanup must operate on the catalog created for this backup,
      // then the final catalog is persisted exactly once.
      if (!backupOutcome.catalogError) {
        try {
          retentionResult = await applyRetentionPolicy(nextCatalog, capturedServer);
          finalCatalog = retentionResult.catalog;
        } catch (error) {
          logError('Failed to apply backup retention policy', error, {
            serverPath: capturedServer.path,
          });
        }
      }

      const saved = await persistBackupCatalogBestEffort(
        () => writeBackupCatalog(capturedServer.id, finalCatalog),
        (error) =>
          logError('Failed to persist backup catalog after backup creation', error, {
            serverPath: capturedServer.path,
            backupName: finalCatalog.lastBackupName ?? normalizedName,
          }),
      );

      if (isCurrentInitialization(operationToken)) {
        setBackupCatalog(finalCatalog);
        notify.success(t('backups.toast.created'));
        setShowCreateModal(false);
        if (backupOutcome.catalogError) {
          logError('Failed to update managed backup catalog', backupOutcome.catalogError, {
            serverId: capturedServer.id,
            serverPath: capturedServer.path,
            backupName: backupOutcome.backupName,
          });
          notify.warning(t('backups.toast.registryUpdateFailed'));
        }
        if (refreshedBackups === null) {
          notify.warning(t('backups.toast.loadFailed'));
        }
        if (backupOutcome.restart.status === 'failed') {
          logError('Backup created but server restart failed', backupOutcome.restart.error, {
            serverId: capturedServer.id,
            serverPath: capturedServer.path,
            backupName: backupOutcome.backupName,
          });
          notify.warning(t('backups.toast.serverRestartFailed'));
        }
        if (retentionResult.failedDeleteCount > 0) {
          notify.warning(
            t('backups.toast.retentionDeleteFailed', {
              count: retentionResult.failedDeleteCount,
            }),
          );
        }
        if (retentionResult.listingFailed) {
          notify.warning(t('backups.toast.retentionListFailed'));
        }
        if (!saved) {
          notify.warning(
            retentionResult.deletedCount > 0
              ? t('backups.toast.retentionMetadataSaveFailed')
              : t('backups.toast.createMetadataSaveFailed'),
          );
        }
      }
    } catch (error) {
      if (isCurrentInitialization(operationToken)) {
        logError('Failed to create backup', error, {
          serverPath: capturedServer.path,
        });
        notify.error(t('backups.toast.createFailed'));
      }
    } finally {
      if (manualOperationStarted) {
        useBackupOperationStore.getState().finishManualOperation(capturedServer.id, operationId);
      }
      if (isCurrentInitialization(operationToken)) {
        endCatalogOperation();
      }
    }
  };

  const handleRestore = async (backupName: string) => {
    const operationToken = getCurrentInitializationToken(initializationKey);
    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    const confirmed = await confirm({
      title: t('backups.restoreTitle'),
      description: t('backups.confirmRestore', { name: backupName }),
      confirmLabel: t('backups.actions.restore'),
    });
    if (!confirmed) {
      return;
    }
    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    setProcessing(true);
    setRestoringName(backupName);
    try {
      await restoreBackup(server.id, backupName);
      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      notify.success(t('backups.toast.restored'));
    } catch (error) {
      if (isCurrentInitialization(operationToken)) {
        logError('Failed to restore backup', error, {
          serverPath: server.path,
          backupName,
        });
        notify.error(t('backups.toast.restoreFailed'));
      }
    } finally {
      if (isCurrentInitialization(operationToken)) {
        setProcessing(false);
        setRestoringName(null);
      }
    }
  };

  const handleDelete = async (backupName: string) => {
    const operationToken = getCurrentInitializationToken(initializationKey);
    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    if (catalogLoadState !== 'ready') {
      notify.error(t('backups.toast.catalogLoadFailed'));
      return;
    }
    if (!beginCatalogOperation()) {
      return;
    }

    try {
      const confirmed = await confirm({
        title: t('backups.deleteTitle'),
        description: t('backups.confirmDelete', { name: backupName }),
        confirmLabel: t('common.delete'),
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }
      if (!isCurrentInitialization(operationToken)) {
        return;
      }

      await deleteBackup(server.id, backupName);
      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      const dataReloadToken = getCurrentDataReloadToken(operationToken);
      if (!dataReloadToken) {
        return;
      }
      await loadBackups(dataReloadToken);
      if (!isCurrentDataReload(dataReloadToken)) {
        return;
      }

      if (catalogLoadState !== 'ready') {
        notify.warning(t('backups.toast.deleteMetadataSaveFailed'));
        return;
      }

      const deletingLatest = backupCatalog.lastBackupName === backupName;
      const nextCatalog: BackupCatalog = {
        ...backupCatalog,
        lastBackupName: deletingLatest ? null : backupCatalog.lastBackupName,
        latestSnapshot: deletingLatest ? {} : backupCatalog.latestSnapshot,
        entries: {
          ...backupCatalog.entries,
        },
      };
      delete nextCatalog.entries[backupName];

      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      setBackupCatalog(nextCatalog);
      const saved = await persistBackupCatalogBestEffort(
        async () => {
          if (!isCurrentInitialization(operationToken)) {
            return;
          }
          await persistBackupCatalog(nextCatalog);
        },
        (error) =>
          isCurrentInitialization(operationToken) &&
          logError('Failed to persist backup catalog after backup deletion', error, {
            serverPath: server.path,
            backupName,
          }),
      );
      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      if (!saved) {
        notify.warning(t('backups.toast.deleteMetadataSaveFailed'));
      } else {
        notify.success(t('backups.toast.deleted'));
      }
    } catch (e) {
      if (isCurrentInitialization(operationToken)) {
        logError('Failed to delete backup', e, {
          serverPath: server.path,
          backupName,
        });
        notify.error(t('backups.toast.deleteFailed'));
      }
    } finally {
      if (isCurrentInitialization(operationToken)) {
        endCatalogOperation();
      }
    }
  };

  const openTagEditor = (backupName: string) => {
    const meta = getBackupMeta(backupName);
    setTagEditorTarget(backupName);
    setTagList(meta.tags);
    setTagDraft('');
    setNoteInput(meta.note);
  };

  const addTagDraft = () => {
    const nextTag = tagDraft.trim();
    if (!nextTag) {
      return;
    }
    setTagList((current) => (current.includes(nextTag) ? current : [...current, nextTag]));
    setTagDraft('');
  };

  const handleSaveTagEditor = async () => {
    const operationToken = getCurrentInitializationToken(initializationKey);
    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    if (!tagEditorTarget || isProcessing || catalogOperationInFlightRef.current) {
      return;
    }
    if (catalogLoadState !== 'ready') {
      notify.error(t('backups.toast.catalogLoadFailed'));
      return;
    }

    if (!beginCatalogOperation()) {
      return;
    }
    try {
      const tags = tagList;
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

      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      await persistBackupCatalog(nextCatalog);
      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      setBackupCatalog(nextCatalog);
      setTagEditorTarget(null);
      notify.success(t('backups.toast.tagSaved'));
    } catch (error) {
      if (isCurrentInitialization(operationToken)) {
        logError('Failed to save backup tags', error, {
          serverPath: server.path,
          backupName: tagEditorTarget,
        });
        notify.error(t('backups.toast.tagSaveFailed'));
      }
    } finally {
      if (isCurrentInitialization(operationToken)) {
        endCatalogOperation();
      }
    }
  };

  const handleDeleteWorld = async (worldName: string) => {
    const operationToken = getCurrentInitializationToken(initializationKey);
    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    setProcessing(true);
    try {
      await deleteItem(`${server.path}/${worldName}`);
      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      notify.success(t('backups.world.deleted', { name: worldName }));
      await loadWorlds(operationToken);
    } catch (error) {
      if (isCurrentInitialization(operationToken)) {
        logError('Failed to delete world data', error, {
          serverPath: server.path,
          worldName,
        });
        notify.error(t('backups.world.deleteFailed'));
      }
    } finally {
      if (isCurrentInitialization(operationToken)) {
        setProcessing(false);
      }
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(date),
    );
  };

  const blockDismiss = (event: Event) => event.preventDefault();

  // Name rules are checked as the user types, with the same validator the create path uses.
  const trimmedName = customName.trim();
  const nameValidation = trimmedName
    ? getBackupNameValidationError(normalizeBackupName(trimmedName))
    : null;
  const nameError = nameValidation
    ? t(
        nameValidation === 'empty'
          ? 'backups.toast.invalidNameEmpty'
          : 'backups.toast.invalidNameCharacters',
      )
    : null;

  // Null until a server size and at least one past backup with a duration exist. The dialog hides the row then.
  const estimatedDurationMs =
    serverSize?.status === 'ready' ? estimateBackupDurationMs(serverSize.bytes, backups) : null;

  const formatFolderSize = (size: FolderSize | null): string => {
    if (!size || size.status === 'loading') return '…';
    if (size.status === 'failed') return '—';
    const formatted = formatBytes(size.bytes, locale);
    return size.complete ? formatted : t('backups.size.atLeast', { size: formatted });
  };

  const formatEstimate = (ms: number): string => {
    const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
    if (totalSeconds < 60) {
      return t('backups.duration.seconds', { count: totalSeconds });
    }
    const totalMinutes = Math.ceil(totalSeconds / 60);
    if (totalMinutes < 60) {
      return t('backups.duration.minutes', { count: totalMinutes });
    }
    return t('backups.duration.hoursMinutes', {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
    });
  };

  const createFooter = (
    <>
      <Button variant="secondary" onClick={() => setShowCreateModal(false)} disabled={isProcessing}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="primary"
        data-testid="backups-create-submit"
        onClick={() => void handleCreateBackup()}
        disabled={isProcessing || nameError !== null}
      >
        {isProcessing ? t('backups.modal.creating') : t('backups.modal.create')}
      </Button>
    </>
  );

  const tagFooter = (
    <>
      <Button variant="secondary" onClick={() => setTagEditorTarget(null)} disabled={isProcessing}>
        {t('common.cancel')}
      </Button>
      <Button variant="primary" onClick={() => void handleSaveTagEditor()} disabled={isProcessing}>
        {t('common.save')}
      </Button>
    </>
  );

  return (
    <div className={styles.page} data-testid="backups-view">
      <header className={styles.header}>
        <SectionTitle icon={Archive} title={t('backups.title')} as="h2" />
        <Button
          variant="primary"
          data-testid="backups-create-button"
          onClick={openCreateModal}
          disabled={isProcessing}
        >
          {isProcessing ? t('backups.processing') : t('backups.createButton')}
        </Button>
      </header>

      {catalogLoadState === 'error' && (
        <Alert
          tone="danger"
          title={t('backups.catalogUnavailable')}
          data-testid="backups-catalog-alert"
        >
          <p className={styles.alertText}>{t('backups.catalogUnavailableDescription')}</p>
          <Button
            variant="secondary"
            size="sm"
            data-testid="backups-catalog-retry"
            onClick={() => void retryCatalogLoad()}
          >
            {t('backups.catalogRetry')}
          </Button>
        </Alert>
      )}

      {restoringName !== null && (
        <p className={styles.status} role="status" aria-live="polite">
          {t('backups.restoring', { name: restoringName })}
        </p>
      )}

      <div className={styles.list} ref={listParentRef} aria-busy={isProcessing || undefined}>
        {loading && <Skeleton label={t('common.loading')} lines={3} />}

        {!loading && backups.length === 0 && <EmptyLine title={t('backups.empty')} />}

        {!loading && backups.length > 0 && (
          <div style={{ height: `${backupVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {backupVirtualizer.getVirtualItems().map((virtualRow) => {
              const backup = backups[virtualRow.index];
              const meta = getBackupMeta(backup.name);
              return (
                <div
                  key={backup.name}
                  ref={backupVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  data-testid={`backup-row-${backup.name}`}
                  className={styles.row}
                  style={{ position: 'absolute', top: virtualRow.start, left: 0, width: '100%' }}
                >
                  <span className={styles.rowIcon} aria-hidden="true">
                    <Package size={18} />
                  </span>

                  <div className={styles.rowMain}>
                    <div className={styles.rowHead}>
                      <span className={styles.rowName}>{backup.name}</span>
                    </div>

                    <div className={styles.rowMeta}>
                      <span>{formatDate(backup.date)}</span>
                      <span>{formatBytes(backup.size, locale)}</span>
                    </div>

                    {meta.tags.length > 0 && (
                      <div className={styles.tags}>
                        {meta.tags.map((tag) => (
                          <Badge key={`${backup.name}-${tag}`} tone="neutral" size="sm">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {meta.note && <p className={styles.rowNote}>{meta.note}</p>}
                  </div>

                  <div className={styles.rowActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRestore(backup.name)}
                      disabled={isProcessing}
                    >
                      {t('backups.actions.restore')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openTagEditor(backup.name)}
                      disabled={isProcessing}
                    >
                      {t('backups.actions.tag')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={styles.dangerAction}
                      onClick={() => handleDelete(backup.name)}
                      disabled={isProcessing || catalogLoadState !== 'ready'}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <section className={styles.worlds} aria-labelledby="backups-world-title">
        <div className={styles.worldHead}>
          <h3 id="backups-world-title" className={styles.sectionTitle}>
            {t('backups.world.title')}
          </h3>
          <span className={styles.muted}>{t('backups.world.detected')}</span>
        </div>

        {worlds.length === 0 ? (
          <EmptyLine title={t('backups.world.empty')} />
        ) : (
          <ul className={styles.worldList}>
            {worlds.map((worldName) => (
              <li key={worldName} className={styles.worldRow}>
                <span className={styles.worldIcon} aria-hidden="true">
                  <Globe size={14} />
                </span>
                <span className={styles.worldName}>{worldName}</span>
                <span className={styles.worldSize} data-testid={`backup-world-size-${worldName}`}>
                  {formatFolderSize(worldSizes[worldName] ?? { status: 'loading' })}
                </span>
                {/* One hold is the confirmation. The row is removed on success, and confirmed={false} resets the hold after a failed delete. */}
                <HoldToConfirm
                  label={t('backups.world.holdToDelete')}
                  confirmedLabel={t('backups.world.holdDone')}
                  tone="danger"
                  confirmed={false}
                  disabled={isProcessing}
                  onConfirm={() => void handleDeleteWorld(worldName)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={showCreateModal}
        onOpenChange={(next) => {
          if (!next && !isProcessing) setShowCreateModal(false);
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          data-testid="backups-create-dialog"
          title={t('backups.modal.createTitle')}
          width="min(560px, calc(100vw - var(--space-8)))"
          footer={createFooter}
          onEscapeKeyDown={isProcessing ? blockDismiss : undefined}
          onPointerDownOutside={isProcessing ? blockDismiss : undefined}
        >
          <div className={styles.form}>
            <Input
              data-testid="backup-name-input"
              label={t('backups.modal.fileName')}
              placeholder={defaultName()}
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              hint={t('backups.modal.fileNameHelp', { default: defaultName() })}
              error={nameError ?? undefined}
              disabled={isProcessing}
            />

            <Select
              testId="backups-compression-select"
              label={t('backups.modal.compressionLevel')}
              placeholder={arc.select.placeholder}
              hint={t('backups.modal.compressionHelp')}
              options={COMPRESSION_OPTIONS}
              value={String(compressionLevel)}
              onValueChange={(value) => setCompressionLevel(Number(value))}
              disabled={isProcessing}
            />

            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt className={styles.factTerm}>
                  <span>{t('backups.modal.targetSize')}</span>
                  <HintIcon
                    hint={t('backups.modal.wholeServerNote')}
                    label={t('backups.modal.targetSize')}
                  />
                </dt>
                <dd className={styles.factValue} data-testid="backups-target-size">
                  {formatFolderSize(serverSize)}
                </dd>
              </div>
              {estimatedDurationMs !== null && (
                <div className={styles.fact}>
                  <dt className={styles.factTerm}>
                    <span>{t('backups.modal.estimatedTime')}</span>
                    <HintIcon
                      hint={t('backups.modal.estimateHint', { count: ESTIMATE_SAMPLE_COUNT })}
                      label={t('backups.modal.estimatedTime')}
                    />
                  </dt>
                  <dd className={styles.factValue} data-testid="backups-estimated-time">
                    {t('backups.modal.estimateValue', {
                      duration: formatEstimate(estimatedDurationMs),
                    })}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={tagEditorTarget !== null}
        onOpenChange={(next) => {
          if (!next && !isProcessing) setTagEditorTarget(null);
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          data-testid="backups-tag-dialog"
          title={t('backups.tagEditor.title')}
          description={tagEditorTarget ?? undefined}
          width="min(520px, calc(100vw - var(--space-8)))"
          footer={tagFooter}
          onEscapeKeyDown={isProcessing ? blockDismiss : undefined}
          onPointerDownOutside={isProcessing ? blockDismiss : undefined}
        >
          <div className={styles.form}>
            <div className={styles.tagAdd}>
              <Input
                label={t('backups.tagEditor.tagsLabel')}
                placeholder={t('backups.tagEditor.tagsPlaceholder')}
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTagDraft();
                  }
                }}
              />
              <Button variant="secondary" disabled={!tagDraft.trim()} onClick={addTagDraft}>
                {t('backups.tagEditor.addTag')}
              </Button>
            </div>

            {tagList.length > 0 ? (
              <div className={styles.tagChips}>
                <ChipGroup
                  label={t('backups.tagEditor.currentTags')}
                  options={tagList.map((tag) => ({ value: tag, label: tag }))}
                  value={tagList}
                  onValueChange={setTagList}
                />
                <p className={styles.muted}>{t('backups.tagEditor.removeHint')}</p>
              </div>
            ) : (
              <p className={styles.muted}>{t('backups.tagEditor.noTags')}</p>
            )}

            <Textarea
              label={t('backups.tagEditor.noteLabel')}
              placeholder={t('backups.tagEditor.notePlaceholder')}
              value={noteInput}
              onChange={(event) => setNoteInput(event.target.value)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
