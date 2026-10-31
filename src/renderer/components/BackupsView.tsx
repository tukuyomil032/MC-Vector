import { useVirtualizer } from '@tanstack/react-virtual';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Globe, Package } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { ChipGroup } from '@/components/arc/chip-group/chip-group';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { HoldToConfirm } from '@/components/arc/hold-to-confirm/hold-to-confirm';
import { Input } from '@/components/arc/input/input';
import { Select } from '@/components/arc/select/select';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { Textarea } from '@/components/arc/textarea/textarea';
import { type Translate, type TranslationKey, useTranslation } from '../../i18n';
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
import { deleteItem, listFiles } from '../../lib/file-commands';
import { notify } from '../shared/notify';
import { useAppFeedback } from './AppFeedbackProvider';
import { tauriListen } from '../../lib/tauri-api';
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

const SIZE_UNITS = ['b', 'kb', 'mb', 'gb'] as const;
const SIZE_UNIT_KEYS: Record<(typeof SIZE_UNITS)[number], TranslationKey> = {
  b: 'backups.units.b',
  kb: 'backups.units.kb',
  mb: 'backups.units.mb',
  gb: 'backups.units.gb',
};

function formatBackupSize(bytes: number, t: Translate, locale: string): string {
  if (bytes <= 0) {
    return `0 ${t(SIZE_UNIT_KEYS.b)}`;
  }
  const index = Math.min(SIZE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: index === 0 ? 0 : 2,
  }).format(value);
  return `${formatted} ${t(SIZE_UNIT_KEYS[SIZE_UNITS[index]])}`;
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
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [customName, setCustomName] = useState('');
  const [compressionLevel, setCompressionLevel] = useState(5);
  const [backupCatalog, setBackupCatalog] = useState<BackupCatalog>(createEmptyCatalog());
  const [catalogLoadState, setCatalogLoadState] = useState<CatalogLoadState>('loading');
  const [worlds, setWorlds] = useState<string[]>([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        notify.success(t('backups.toast.targetUpdated', { count: normalizedPaths.length }));
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

  // The completion reload intentionally uses the lifecycle callbacks from this render.
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
      notify.error(t('backups.toast.targetInitFailed'));
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
        title: t('backupSelector.windowTitle', { name: server.name }),
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
              notify.error(t('backups.toast.selectorOpenError'));
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
          notify.error(t('backups.toast.selectorOpenError'));
        }),
        'Failed to register backup selector error listener',
      );
    } catch (error) {
      if (!isCurrentInitialization(operationToken)) {
        return;
      }
      logError('Failed to open backup selector window', error, { serverPath: server.path });
      notify.error(t('backups.toast.selectorOpenError'));
    }
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
      notify.error(t('backups.toast.catalogLoadFailed'));
      return;
    }

    const capturedServer = { ...server };
    const capturedSelectedPaths = normalizeBackupSources(Array.from(selectedPaths));
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
        mode: 'full' as const,
        parent: null,
        tags: [],
        note: '',
        sourceCount: 0,
        createdAt: '',
      };
      const nextCatalog: BackupCatalog = {
        lastBackupName: normalizedName,
        latestSnapshot: {},
        entries: {
          ...capturedCatalog.entries,
          [normalizedName]: {
            ...currentMeta,
            mode: 'full',
            parent: null,
            sourceCount: 0,
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
          selectedCount: capturedSelectedPaths.length,
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
        <h2 className={styles.title}>{t('backups.title')}</h2>
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

        {!loading && backups.length === 0 && (
          <EmptyState title={t('backups.empty')} description={t('backups.emptyDescription')} />
        )}

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
                      <Badge tone="neutral" size="sm">
                        {meta.mode === 'differential'
                          ? t('backups.mode.differential')
                          : t('backups.mode.full')}
                      </Badge>
                    </div>

                    <div className={styles.rowMeta}>
                      <span>{formatDate(backup.date)}</span>
                      <span>{formatBackupSize(backup.size, t, locale)}</span>
                      {meta.parent && (
                        <span>
                          {t('backups.parent')}: {meta.parent}
                        </span>
                      )}
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
          <EmptyState
            title={t('backups.world.empty')}
            description={t('backups.world.emptyDescription')}
          />
        ) : (
          <ul className={styles.worldList}>
            {worlds.map((worldName) => (
              <li key={worldName} className={styles.worldRow}>
                <span className={styles.worldIcon} aria-hidden="true">
                  <Globe size={16} />
                </span>
                <span className={styles.worldName}>{worldName}</span>
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
              description={t('backups.modal.fileNameHelp', { default: defaultName() })}
              error={nameError ?? undefined}
              disabled={isProcessing}
            />

            <Select
              testId="backups-compression-select"
              label={t('backups.modal.compressionLevel')}
              description={t('backups.modal.compressionHelp')}
              options={COMPRESSION_OPTIONS}
              value={String(compressionLevel)}
              onValueChange={(value) => setCompressionLevel(Number(value))}
              disabled={isProcessing}
            />

            <section className={styles.target} aria-labelledby="backups-target-title">
              <div className={styles.targetHead}>
                <h3 id="backups-target-title" className={styles.sectionTitle}>
                  {t('backups.modal.selectTarget')}
                </h3>
                <div className={styles.targetActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="backups-open-selector-button"
                    onClick={() => void openSelectorWindow()}
                  >
                    {t('backups.modal.openSelector')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    {t('backups.modal.clearAll')}
                  </Button>
                </div>
              </div>

              {selectedPaths.size === 0 ? (
                <p className={styles.muted}>{t('backups.modal.noSelection')}</p>
              ) : (
                <div className={styles.targetSummary}>
                  <p className={styles.targetCount}>
                    {t('backups.modal.selectedCount', { count: selectedPaths.size })}
                  </p>
                  <ul className={styles.targetList}>
                    {Array.from(selectedPaths)
                      .sort((left, right) => left.localeCompare(right))
                      .slice(0, 14)
                      .map((path) => (
                        <li key={path} className={styles.targetItem}>
                          {path}
                        </li>
                      ))}
                    {selectedPaths.size > 14 && (
                      <li className={styles.targetItem}>
                        {t('backups.modal.andMore', { count: selectedPaths.size - 14 })}
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </section>
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
