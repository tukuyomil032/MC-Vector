import { useVirtualizer } from '@tanstack/react-virtual';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { ask } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from '../../i18n';
import {
  applyBackupRetention,
  createBackup,
  deleteBackup,
  getBackupNameValidationError,
  listBackupsWithMetadata,
  normalizeBackupSources,
  readBackupCatalog,
  restoreBackup,
  writeBackupCatalog,
} from '../../lib/backup-commands';
import { logError } from '../../lib/error-utils';
import { deleteItem, listFiles, listFilesWithMetadata } from '../../lib/file-commands';
import { tauriListen } from '../../lib/tauri-api';
import {
  getManualBackupOperationId,
  useBackupOperationStore,
} from '../../store/backupOperationStore';
import { buildManualBackupName } from '../shared/auto-backup';
import type { MinecraftServer } from '../shared/server declaration';
import { Button } from './ui/Button';
import { Input, NativeSelect, Textarea } from './ui/Field';

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

type MaybeAsyncUnlisten = () => void | Promise<void>;

interface SelectorOnceRegistration {
  cancelled: boolean;
  unlistenFns: Set<MaybeAsyncUnlisten>;
}

function safeUnlisten(unlisten: MaybeAsyncUnlisten | undefined): void {
  if (!unlisten) {
    return;
  }

  try {
    const result = unlisten();
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    return;
  }
}

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
  const { t } = useTranslation();
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
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [customName, setCustomName] = useState('');
  const [compressionLevel, setCompressionLevel] = useState(5);
  const [backupMode, setBackupMode] = useState<BackupMode>('full');
  const [backupCatalog, setBackupCatalog] = useState<BackupCatalog>(createEmptyCatalog());
  const [catalogLoadState, setCatalogLoadState] = useState<CatalogLoadState>('loading');
  const [worlds, setWorlds] = useState<string[]>([]);
  const [tagEditorTarget, setTagEditorTarget] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const catalogOperationInFlightRef = useRef(false);
  const initializationKey = `${server.id}\0${server.path}`;
  const initializationKeyRef = useRef<string | null>(null);
  const initializationGenerationRef = useRef(0);
  const dataReloadGenerationRef = useRef(0);
  const selectionGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const pendingUnmountRef = useRef<symbol | null>(null);
  const observedManualCompletionRef = useRef({
    key: initializationKey,
    revision: manualCompletionRevision,
  });
  const selectorOnceRegistrationsRef = useRef(new Set<SelectorOnceRegistration>());
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
  const cleanupSelectorOnceRegistrations = useCallback(() => {
    for (const registration of selectorOnceRegistrationsRef.current) {
      registration.cancelled = true;
      for (const unlisten of registration.unlistenFns) {
        safeUnlisten(unlisten);
      }
      registration.unlistenFns.clear();
    }
    selectorOnceRegistrationsRef.current.clear();
  }, []);
  const cleanupInitialization = useCallback(() => {
    cleanupSelectorOnceRegistrations();
    scheduleUnmountInvalidation();
  }, [cleanupSelectorOnceRegistrations, scheduleUnmountInvalidation]);
  const showToast = (msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    if (type === 'success') {
      toast.success(msg);
    } else if (type === 'error') {
      toast.error(msg);
    } else if (type === 'warning') {
      toast.warning(msg);
    } else {
      toast(msg);
    }
  };
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
    setCatalogLoadState('loading');
    setBackupCatalog(createEmptyCatalog());
    setSelectedPaths(new Set());
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
  }, [beginDataReload, cleanupInitialization, initializationKey, isCurrentDataReload]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const registrationToken = getCurrentInitializationToken(initializationKey);

    void tauriListen<{ serverPath: string; paths: string[] }>(
      'backup-selector:apply',
      (payload) => {
        if (
          cancelled ||
          !isCurrentInitialization(registrationToken) ||
          payload.serverPath !== server.path
        ) {
          return;
        }

        const normalizedPaths = normalizeBackupSources(payload.paths);
        selectionGenerationRef.current += 1;
        setSelectedPaths(new Set(normalizedPaths));
        if (cancelled || !isCurrentInitialization(registrationToken)) {
          return;
        }
        showToast(t('backups.toast.targetUpdated', { count: normalizedPaths.length }), 'success');
      },
    ).then(
      (dispose) => {
        if (cancelled) {
          safeUnlisten(dispose);
          return;
        }
        unlisten = dispose;
      },
      (error) => {
        if (cancelled || !isCurrentInitialization(registrationToken)) {
          return;
        }
        logError('Failed to register backup selector apply listener', error, {
          serverPath: server.path,
        });
      },
    );

    return () => {
      cancelled = true;
      safeUnlisten(unlisten);
    };
  }, [getCurrentInitializationToken, initializationKey, isCurrentInitialization, server.path, t]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const registrationToken = getCurrentInitializationToken(initializationKey);

    void tauriListen<{ serverPath: string }>('backup-selector:close-request', async (payload) => {
      if (
        cancelled ||
        !isCurrentInitialization(registrationToken) ||
        payload.serverPath !== server.path
      ) {
        return;
      }
      try {
        const selectorWindow = await WebviewWindow.getByLabel('backup-selector');
        if (cancelled || !isCurrentInitialization(registrationToken)) {
          return;
        }
        if (!selectorWindow) {
          return;
        }
        await selectorWindow.close();
        if (cancelled || !isCurrentInitialization(registrationToken)) {
          return;
        }
      } catch (error) {
        if (cancelled || !isCurrentInitialization(registrationToken)) {
          return;
        }
        logError('Failed to close backup selector window', error, {
          serverPath: server.path,
        });
      }
    }).then(
      (dispose) => {
        if (cancelled) {
          safeUnlisten(dispose);
          return;
        }
        unlisten = dispose;
      },
      (error) => {
        if (cancelled || !isCurrentInitialization(registrationToken)) {
          return;
        }
        logError('Failed to register backup selector close-request listener', error, {
          serverPath: server.path,
        });
      },
    );

    return () => {
      cancelled = true;
      safeUnlisten(unlisten);
    };
  }, [getCurrentInitializationToken, initializationKey, isCurrentInitialization, server.path]);

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
      showToast(t('backups.toast.catalogLoadFailed'), 'error');
    }
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
      showToast(t('backups.toast.loadFailed'), 'error');
    } finally {
      if (isCurrentDataReload(expectedToken)) {
        setLoading(false);
      }
    }
  };

  const defaultName = () => {
    return buildManualBackupName(server);
  };

  const openCreateModal = async () => {
    const operationToken = getCurrentInitializationToken(initializationKey);
    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    const selectionGeneration = selectionGenerationRef.current + 1;
    selectionGenerationRef.current = selectionGeneration;
    setShowCreateModal(true);
    setCustomName('');
    setCompressionLevel(5);
    setBackupMode('full');
    try {
      const entries = await listFiles(server.path);
      if (
        !isCurrentInitialization(operationToken) ||
        selectionGenerationRef.current !== selectionGeneration
      ) {
        return;
      }
      const initial = entries
        .filter((entry) => entry.name.toLowerCase() !== 'backups')
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
      setSelectedPaths(new Set(initial));
    } catch (error) {
      if (
        !isCurrentInitialization(operationToken) ||
        selectionGenerationRef.current !== selectionGeneration
      ) {
        return;
      }
      logError('Failed to initialize backup target selection', error, {
        serverPath: server.path,
      });
      setSelectedPaths(new Set());
      showToast(t('backups.toast.targetInitFailed'), 'error');
    }
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
    } catch (error) {
      if (!isCurrentInitialization(expectedToken)) {
        return;
      }
      logError('Failed to load world candidates', error, { serverPath: server.path });
      setWorlds([]);
      showToast(t('backups.toast.worldLoadFailed'), 'error');
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
    loadBackupCatalog,
    loadBackups,
    manualCompletionRevision,
  ]);

  const clearAll = () => {
    selectionGenerationRef.current += 1;
    setSelectedPaths(new Set());
  };

  const openSelectorWindow = async () => {
    const operationToken = getCurrentInitializationToken(initializationKey);
    if (!isCurrentInitialization(operationToken)) {
      return;
    }

    try {
      const label = 'backup-selector';
      const selected = Array.from(selectedPaths).sort((a, b) => a.localeCompare(b));

      const existing = await WebviewWindow.getByLabel(label);
      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      if (existing) {
        if (!isCurrentInitialization(operationToken)) {
          return;
        }
        await existing.emit('backup-selector:load', {
          serverPath: server.path,
          selected,
        });
        if (!isCurrentInitialization(operationToken)) {
          return;
        }

        try {
          if (!isCurrentInitialization(operationToken)) {
            return;
          }
          await existing.setFocus();
          if (!isCurrentInitialization(operationToken)) {
            return;
          }
        } catch (focusError) {
          if (!isCurrentInitialization(operationToken)) {
            return;
          }
          logError('Failed to focus backup selector window', focusError, {
            serverPath: server.path,
          });
        }
        return;
      }

      if (!isCurrentInitialization(operationToken)) {
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

      if (!isCurrentInitialization(operationToken)) {
        return;
      }

      const onceRegistration: SelectorOnceRegistration = {
        cancelled: false,
        unlistenFns: new Set(),
      };
      selectorOnceRegistrationsRef.current.add(onceRegistration);
      const trackOnceRegistration = (
        registrationPromise: Promise<() => void>,
        errorMessage: string,
      ) => {
        void registrationPromise.then(
          (unlisten) => {
            if (onceRegistration.cancelled || !isCurrentInitialization(operationToken)) {
              safeUnlisten(unlisten);
              return;
            }
            onceRegistration.unlistenFns.add(unlisten);
          },
          (error) => {
            if (onceRegistration.cancelled || !isCurrentInitialization(operationToken)) {
              return;
            }
            logError(errorMessage, error, { serverPath: server.path });
          },
        );
      };

      trackOnceRegistration(
        selectorWindow.once('tauri://created', () => {
          if (!isCurrentInitialization(operationToken)) {
            return;
          }
          void selectorWindow
            .emit('backup-selector:load', {
              serverPath: server.path,
              selected,
            })
            .catch((error) => {
              if (!isCurrentInitialization(operationToken)) {
                return;
              }
              logError('Failed to load backup selector window', error, {
                serverPath: server.path,
              });
              showToast(t('backups.toast.selectorOpenError'), 'error');
            });
        }),
        'Failed to register backup selector created listener',
      );

      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      trackOnceRegistration(
        selectorWindow.once('tauri://error', (error) => {
          if (!isCurrentInitialization(operationToken)) {
            return;
          }
          logError('Backup selector window emitted tauri error event', error, {
            serverPath: server.path,
          });
          showToast(t('backups.toast.selectorOpenError'), 'error');
        }),
        'Failed to register backup selector error listener',
      );
    } catch (error) {
      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      logError('Failed to open backup selector window', error, { serverPath: server.path });
      showToast(t('backups.toast.selectorOpenError'), 'error');
    }
  };

  const buildSnapshotForSelection = async (
    paths: string[],
    serverPath: string,
  ): Promise<Record<string, BackupSnapshotEntry>> => {
    const snapshot: Record<string, BackupSnapshotEntry> = {};
    const rootEntries = await listFilesWithMetadata(serverPath);
    const rootMap = new Map(rootEntries.map((entry) => [entry.name, entry]));

    const walkDirectory = async (relativeDir: string) => {
      const entries = await listFilesWithMetadata(`${serverPath}/${relativeDir}`);
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
        const entries = await listFilesWithMetadata(`${serverPath}/${parentRelative}`);
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
        logError('Failed to capture backup snapshot entry', error, {
          serverPath,
          relativePath: normalizedPath,
        });
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
      showToast(t('backups.toast.catalogLoadFailed'), 'error');
      return;
    }

    if (selectedPaths.size === 0) {
      showToast(t('backups.toast.selectAtLeastOne'), 'info');
      return;
    }

    const capturedServer = { ...server };
    const capturedSelectedPaths = normalizeBackupSources(Array.from(selectedPaths));
    const capturedMode = backupMode;
    const capturedCatalog = backupCatalog;
    const capturedCompressionLevel = compressionLevel;
    const requestedName = customName.trim() || buildManualBackupName(capturedServer);
    const normalizedName = normalizeBackupName(requestedName);
    const nameValidationError = getBackupNameValidationError(normalizedName);
    if (nameValidationError) {
      showToast(
        nameValidationError === 'empty'
          ? t('backups.toast.invalidNameEmpty')
          : t('backups.toast.invalidNameCharacters'),
        'error',
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

      if (capturedSelectedPaths.length === 0) {
        if (isCurrentInitialization(operationToken)) {
          showToast(t('backups.toast.selectAtLeastOne'), 'info');
        }
        return;
      }

      const snapshot = await buildSnapshotForSelection(capturedSelectedPaths, capturedServer.path);
      let sourcesForBackup = capturedSelectedPaths;
      let parentBackupName: string | null = null;

      if (capturedMode === 'differential') {
        parentBackupName = capturedCatalog.lastBackupName;
        const changed = Object.entries(snapshot)
          .filter(([path, nextEntry]) => {
            const previous = capturedCatalog.latestSnapshot[path];
            if (!previous) {
              return true;
            }
            return previous.size !== nextEntry.size || previous.modified !== nextEntry.modified;
          })
          .map(([path]) => path)
          .sort((a, b) => a.localeCompare(b));

        if (changed.length === 0) {
          if (isCurrentInitialization(operationToken)) {
            showToast(t('backups.toast.noDiffSkipped'), 'info');
          }
          return;
        }

        sourcesForBackup = normalizeBackupSources(changed);
      }

      await createBackup(
        capturedServer.id,
        normalizedName,
        sourcesForBackup,
        capturedCompressionLevel,
      );

      const currentMeta = capturedCatalog.entries[normalizedName] ?? {
        mode: 'full' as const,
        parent: null,
        tags: [],
        note: '',
        sourceCount: 0,
        createdAt: '',
      };
      const nextCatalog: BackupCatalog = {
        lastBackupName: normalizedName,
        latestSnapshot: snapshot,
        entries: {
          ...capturedCatalog.entries,
          [normalizedName]: {
            ...currentMeta,
            mode: capturedMode,
            parent: capturedMode === 'differential' ? parentBackupName : null,
            sourceCount: sourcesForBackup.length,
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
      try {
        retentionResult = await applyRetentionPolicy(nextCatalog, capturedServer);
        finalCatalog = retentionResult.catalog;
      } catch (error) {
        logError('Failed to apply backup retention policy', error, {
          serverPath: capturedServer.path,
        });
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
        showToast(
          capturedMode === 'differential'
            ? t('backups.toast.diffCreated', { count: sourcesForBackup.length })
            : t('backups.toast.created'),
          'success',
        );
        setShowCreateModal(false);
        if (retentionResult.failedDeleteCount > 0) {
          showToast(
            t('backups.toast.retentionDeleteFailed', {
              count: retentionResult.failedDeleteCount,
            }),
            'warning',
          );
        }
        if (retentionResult.listingFailed) {
          showToast(t('backups.toast.retentionListFailed'), 'warning');
        }
        if (!saved) {
          showToast(
            retentionResult.deletedCount > 0
              ? t('backups.toast.retentionMetadataSaveFailed')
              : t('backups.toast.createMetadataSaveFailed'),
            'warning',
          );
        }
      }
    } catch (error) {
      if (isCurrentInitialization(operationToken)) {
        logError('Failed to create backup', error, {
          serverPath: capturedServer.path,
          backupMode: capturedMode,
          selectedCount: capturedSelectedPaths.length,
        });
        showToast(t('backups.toast.createFailed'), 'error');
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
    setProcessing(true);
    try {
      await restoreBackup(server.id, backupName);
      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      showToast(t('backups.toast.restored'), 'success');
    } catch (error) {
      if (isCurrentInitialization(operationToken)) {
        logError('Failed to restore backup', error, {
          serverPath: server.path,
          backupName,
        });
        showToast(t('backups.toast.restoreFailed'), 'error');
      }
    } finally {
      if (isCurrentInitialization(operationToken)) {
        setProcessing(false);
      }
    }
  };

  const handleDelete = async (backupName: string) => {
    const operationToken = getCurrentInitializationToken(initializationKey);
    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    if (catalogLoadState !== 'ready') {
      showToast(t('backups.toast.catalogLoadFailed'), 'error');
      return;
    }
    if (!beginCatalogOperation()) {
      return;
    }

    try {
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
        showToast(t('backups.toast.deleteMetadataSaveFailed'), 'warning');
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
        showToast(t('backups.toast.deleteMetadataSaveFailed'), 'warning');
      } else {
        showToast(t('backups.toast.deleted'), 'success');
      }
    } catch (e) {
      if (isCurrentInitialization(operationToken)) {
        logError('Failed to delete backup', e, {
          serverPath: server.path,
          backupName,
        });
        showToast(t('backups.toast.deleteFailed'), 'error');
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
    setTagInput(meta.tags.join(', '));
    setNoteInput(meta.note);
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
      showToast(t('backups.toast.catalogLoadFailed'), 'error');
      return;
    }

    if (!beginCatalogOperation()) {
      return;
    }
    try {
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

      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      await persistBackupCatalog(nextCatalog);
      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      setBackupCatalog(nextCatalog);
      setTagEditorTarget(null);
      showToast(t('backups.toast.tagSaved'), 'success');
    } catch (error) {
      if (isCurrentInitialization(operationToken)) {
        logError('Failed to save backup tags', error, {
          serverPath: server.path,
          backupName: tagEditorTarget,
        });
        showToast(t('backups.toast.tagSaveFailed'), 'error');
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
    const confirmed = await ask(t('backups.world.confirmDelete', { name: worldName }), {
      title: t('backups.world.deleteTitle'),
      kind: 'warning',
    });
    if (!confirmed) {
      return;
    }

    if (!isCurrentInitialization(operationToken)) {
      return;
    }
    const finalConfirm = await ask(t('backups.world.finalConfirm'), {
      title: t('backups.world.finalConfirmTitle'),
      kind: 'warning',
    });
    if (!finalConfirm) {
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
      showToast(t('backups.world.deleted', { name: worldName }), 'success');
      await loadWorlds(operationToken);
    } catch (error) {
      if (isCurrentInitialization(operationToken)) {
        logError('Failed to delete world data', error, {
          serverPath: server.path,
          worldName,
        });
        showToast(t('backups.world.deleteFailed'), 'error');
      }
    } finally {
      if (isCurrentInitialization(operationToken)) {
        setProcessing(false);
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) {
      return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div
      className="backups-view flex h-full flex-col gap-4 p-5 max-[900px]:p-4"
      data-testid="backups-view"
    >
      <div className="backups-view__header">
        <h3>{t('backups.title')}</h3>
        <Button
          variant="primary"
          data-testid="backups-create-button"
          onClick={openCreateModal}
          disabled={isProcessing}
        >
          {isProcessing ? t('backups.processing') : t('backups.createButton')}
        </Button>
      </div>

      <div className="backups-view__list-panel" ref={listParentRef}>
        {loading && <div className="p-5 text-center">{t('common.loading')}</div>}

        {!loading && backups.length === 0 && (
          <div className="backups-view__empty">{t('backups.empty')}</div>
        )}

        {!loading && backups.length > 0 && (
          <div style={{ height: `${backupVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {backupVirtualizer.getVirtualItems().map((virtualRow) => {
              const backup = backups[virtualRow.index];
              return (
                <div
                  key={backup.name}
                  ref={backupVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  data-testid={`backup-row-${backup.name}`}
                  className="backups-view__item-row"
                  style={{ position: 'absolute', top: virtualRow.start, left: 0, width: '100%' }}
                >
                  <div className="text-2xl">📦</div>

                  <div className="flex-1">
                    <div className="font-bold text-base text-text-primary">{backup.name}</div>
                    <div className="text-sm text-text-secondary mt-1">
                      {formatDate(backup.date)}
                    </div>
                    <div className="backups-view__item-meta mt-2">
                      <span
                        className={`backups-view__mode-badge ${
                          getBackupMeta(backup.name).mode === 'differential' ? 'is-diff' : ''
                        }`}
                      >
                        {getBackupMeta(backup.name).mode === 'differential'
                          ? t('backups.mode.differential')
                          : t('backups.mode.full')}
                      </span>

                      {getBackupMeta(backup.name).parent && (
                        <span className="backups-view__parent-label">
                          {t('backups.parent')}: {getBackupMeta(backup.name).parent}
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
                    <Button
                      variant="secondary"
                      className="h-auto px-3 py-1.5 text-sm disabled:opacity-70"
                      onClick={() => handleRestore(backup.name)}
                      disabled={isProcessing}
                    >
                      {t('backups.actions.restore')}
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-auto px-3 py-1.5 text-sm disabled:opacity-70"
                      onClick={() => openTagEditor(backup.name)}
                      disabled={isProcessing}
                    >
                      {t('backups.actions.tag')}
                    </Button>
                    <Button
                      variant="stop"
                      className="h-auto px-3 py-1.5 text-sm disabled:opacity-70"
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

      <div className="backups-view__world-panel">
        <div className="backups-view__world-header">
          <h4 className="backups-view__world-title">{t('backups.world.title')}</h4>
          <span className="backups-view__world-help">{t('backups.world.detected')}</span>
        </div>

        {worlds.length === 0 ? (
          <div className="backups-view__world-empty">{t('backups.world.empty')}</div>
        ) : (
          worlds.map((worldName) => (
            <div key={worldName} className="backups-view__world-row">
              <div className="backups-view__world-name">🌍 {worldName}</div>
              <Button
                type="button"
                variant="stop"
                className="h-auto px-3 py-1.5 text-sm disabled:opacity-70"
                onClick={() => void handleDeleteWorld(worldName)}
                disabled={isProcessing}
              >
                {t('backups.world.deleteButton')}
              </Button>
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
              <div className="text-lg font-bold">{t('backups.modal.createTitle')}</div>
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                {t('common.close')}
              </Button>
            </div>

            <div className="backups-view__create-body">
              <div className="backups-view__form-grid">
                <div className="backups-view__form-group">
                  <label className="backups-view__form-label">{t('backups.modal.fileName')}</label>
                  <Input
                    data-testid="backup-name-input"
                    placeholder={defaultName()}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                  <div className="backups-view__form-help">
                    {t('backups.modal.fileNameHelp', { default: defaultName() })}
                  </div>
                </div>

                <div className="backups-view__form-group">
                  <label className="backups-view__form-label">
                    {t('backups.modal.compressionLevel')}
                  </label>
                  <NativeSelect
                    className="w-[120px]"
                    value={compressionLevel}
                    onChange={(e) => setCompressionLevel(Number(e.target.value))}
                  >
                    {Array.from({ length: 9 }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </NativeSelect>
                  <div className="backups-view__form-help">
                    {t('backups.modal.compressionHelp')}
                  </div>
                </div>

                <div className="backups-view__form-group">
                  <label className="backups-view__form-label">{t('backups.modal.modeLabel')}</label>
                  <NativeSelect
                    value={backupMode}
                    onChange={(event) => setBackupMode(event.target.value as BackupMode)}
                  >
                    <option value="full">{t('backups.modal.modeFull')}</option>
                    <option value="differential">{t('backups.modal.modeDiff')}</option>
                  </NativeSelect>
                  <div className="backups-view__form-help">{t('backups.modal.modeHelp')}</div>
                </div>
              </div>

              <div className="backups-view__selection-header">
                <div className="font-semibold">{t('backups.modal.selectTarget')}</div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="text-sm"
                    data-testid="backups-open-selector-button"
                    onClick={() => void openSelectorWindow()}
                  >
                    {t('backups.modal.openSelector')}
                  </Button>
                  <Button variant="secondary" className="text-sm" onClick={clearAll}>
                    {t('backups.modal.clearAll')}
                  </Button>
                </div>
              </div>

              <div className="backups-view__tree-panel">
                {selectedPaths.size === 0 ? (
                  <div className="backups-view__tree-loading">{t('backups.modal.noSelection')}</div>
                ) : (
                  <div className="backups-view__selected-summary">
                    <div className="backups-view__selected-count">
                      {t('backups.modal.selectedCount', { count: selectedPaths.size })}
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
                          {t('backups.modal.andMore', { count: selectedPaths.size - 14 })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="backups-view__create-actions">
                <Button
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isProcessing}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  data-testid="backups-create-submit"
                  onClick={handleCreateBackup}
                  disabled={isProcessing || selectedPaths.size === 0}
                >
                  {isProcessing ? t('backups.modal.creating') : t('backups.modal.create')}
                </Button>
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
              <h4 className="backups-view__tag-title">{t('backups.tagEditor.title')}</h4>
              <div className="backups-view__tag-target">{tagEditorTarget}</div>
            </div>

            <div className="backups-view__tag-body">
              <label className="backups-view__form-label">{t('backups.tagEditor.tagsLabel')}</label>
              <Input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder={t('backups.tagEditor.tagsPlaceholder')}
              />

              <label className="backups-view__form-label mt-3">
                {t('backups.tagEditor.noteLabel')}
              </label>
              <Textarea
                className="backups-view__tag-note"
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
                placeholder={t('backups.tagEditor.notePlaceholder')}
              />
            </div>

            <div className="backups-view__tag-actions">
              <Button variant="secondary" onClick={() => setTagEditorTarget(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleSaveTagEditor()}
                disabled={isProcessing}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
