import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChevronRight, File, Folder, FolderOpen, HardDrive, SquareCheckBig } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/arc/button/button';
import { Checkbox } from '@/components/arc/checkbox/checkbox';
import { Alert } from '@/components/arc/alert/alert';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { type Translate, type TranslationKey, useTranslation } from '../../i18n';
import { normalizeBackupSources } from '../../lib/backup-commands';
import { logError } from '../../lib/error-utils';
import { listFilesWithMetadata } from '../../lib/file-commands';
import { tauriListen } from '../../lib/tauri-api';
import styles from './BackupTargetSelectorWindow.module.css';

interface SelectorNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  children?: SelectorNode[];
}

interface IncomingPayload {
  serverPath: string;
  selected: string[];
}

function parseInitialPayload(): IncomingPayload {
  const params = new URLSearchParams(window.location.search);
  const serverPath = params.get('serverPath') ?? '';
  const selectedRaw = params.get('selected') ?? '[]';

  try {
    const parsed = JSON.parse(selectedRaw);
    const selected = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];

    return {
      serverPath,
      selected,
    };
  } catch {
    return {
      serverPath,
      selected: [],
    };
  }
}

const SIZE_UNITS = ['b', 'kb', 'mb', 'gb', 'tb'] as const;
const SIZE_UNIT_KEYS: Record<(typeof SIZE_UNITS)[number], TranslationKey> = {
  b: 'backupSelector.units.b',
  kb: 'backupSelector.units.kb',
  mb: 'backupSelector.units.mb',
  gb: 'backupSelector.units.gb',
  tb: 'backupSelector.units.tb',
};

const formatSize = (bytes: number, t: Translate, locale: string): string => {
  if (bytes <= 0) {
    return `0 ${t(SIZE_UNIT_KEYS.b)}`;
  }

  const index = Math.min(SIZE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: index === 0 ? 0 : 2,
  }).format(value);
  return `${formatted} ${t(SIZE_UNIT_KEYS[SIZE_UNITS[index]])}`;
};

const sortNodes = (nodes: SelectorNode[]): SelectorNode[] => {
  return [...nodes].sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) {
      return left.isDirectory ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
};

const setNodeSelection = (node: SelectorNode, checked: boolean, targetSet: Set<string>) => {
  if (checked) {
    targetSet.add(node.path);
  } else {
    targetSet.delete(node.path);
  }

  if (node.children) {
    node.children.forEach((child) => setNodeSelection(child, checked, targetSet));
  }
};

type NodeSelectionState = 'checked' | 'mixed' | 'unchecked';

const isPathWithin = (path: string, ancestor: string): boolean => {
  return path === ancestor || path.startsWith(`${ancestor}/`);
};

const findSelectedAncestorPath = (path: string, selected: Set<string>): string | null => {
  let candidate: string | null = null;
  for (const selectedPath of selected) {
    if (selectedPath !== path && isPathWithin(path, selectedPath)) {
      if (!candidate || selectedPath.length > candidate.length) {
        candidate = selectedPath;
      }
    }
  }
  return candidate;
};

const buildSelectionStateMap = (
  nodes: SelectorNode[],
  selected: Set<string>,
): Map<string, NodeSelectionState> => {
  const states = new Map<string, NodeSelectionState>();

  const markSubtreeChecked = (node: SelectorNode) => {
    states.set(node.path, 'checked');
    node.children?.forEach(markSubtreeChecked);
  };

  const visit = (node: SelectorNode, inheritedSelection: boolean): NodeSelectionState => {
    if (inheritedSelection || selected.has(node.path)) {
      markSubtreeChecked(node);
      return 'checked';
    }

    if (!node.children || node.children.length === 0) {
      states.set(node.path, 'unchecked');
      return 'unchecked';
    }

    const childStates = node.children.map((child) => visit(child, false));
    const state = childStates.every((childState) => childState === 'checked')
      ? 'checked'
      : childStates.some((childState) => childState !== 'unchecked')
        ? 'mixed'
        : 'unchecked';
    states.set(node.path, state);
    return state;
  };

  nodes.forEach((node) => visit(node, false));
  return states;
};

const findNodeByPath = (nodes: SelectorNode[], path: string): SelectorNode | null => {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }
    if (node.children) {
      const match = findNodeByPath(node.children, path);
      if (match) {
        return match;
      }
    }
  }
  return null;
};

const clearNodeSelection = (node: SelectorNode, targetSet: Set<string>) => {
  for (const selectedPath of targetSet) {
    if (isPathWithin(selectedPath, node.path)) {
      targetSet.delete(selectedPath);
    }
  }
};

const expandSelectionForExclusion = (
  selectedAncestor: SelectorNode,
  excludedNode: SelectorNode,
  targetSet: Set<string>,
) => {
  clearNodeSelection(selectedAncestor, targetSet);

  const addExceptExcluded = (node: SelectorNode) => {
    if (isPathWithin(node.path, excludedNode.path)) {
      return;
    }

    if (isPathWithin(excludedNode.path, node.path)) {
      node.children?.forEach(addExceptExcluded);
      return;
    }

    targetSet.add(node.path);
  };

  selectedAncestor.children?.forEach(addExceptExcluded);
};

export default function BackupTargetSelectorWindow() {
  const { t, locale } = useTranslation();
  const currentWindow = getCurrentWindow();
  const initial = useMemo(parseInitialPayload, []);

  const [serverPath, setServerPath] = useState(initial.serverPath);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(normalizeBackupSources(initial.selected)),
  );
  const [tree, setTree] = useState<SelectorNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const treeRequestGenerationRef = useRef(0);

  const selectionStateMap = useMemo(() => buildSelectionStateMap(tree, selected), [selected, tree]);

  const loadTree = useCallback(async (basePath: string, preselected: Set<string>) => {
    const requestGeneration = ++treeRequestGenerationRef.current;
    const isCurrentRequest = () => treeRequestGenerationRef.current === requestGeneration;

    if (!basePath) {
      if (!isCurrentRequest()) {
        return;
      }
      setTree([]);
      setExpanded(new Set());
      setLoadError(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(false);
    try {
      const walk = async (absolutePath: string, relativeRoot = ''): Promise<SelectorNode[]> => {
        const entries = await listFilesWithMetadata(absolutePath);

        const nodes = await Promise.all(
          entries
            .filter(
              (entry) => !(relativeRoot.length === 0 && entry.name.toLowerCase() === 'backups'),
            )
            .map(async (entry) => {
              const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;

              if (!entry.isDirectory) {
                return {
                  name: entry.name,
                  path: relativePath,
                  isDirectory: false,
                  size: Math.max(0, entry.size),
                } satisfies SelectorNode;
              }

              const children = await walk(`${absolutePath}/${entry.name}`, relativePath);
              const totalSize = children.reduce((sum, child) => sum + child.size, 0);

              return {
                name: entry.name,
                path: relativePath,
                isDirectory: true,
                size: totalSize,
                children: sortNodes(children),
              } satisfies SelectorNode;
            }),
        );

        return sortNodes(nodes);
      };

      const nextTree = await walk(basePath);
      if (!isCurrentRequest()) {
        return;
      }
      setTree(nextTree);

      const nextExpanded = new Set<string>();
      const collectExpanded = (node: SelectorNode, depth: number): boolean => {
        const isSelected = preselected.has(node.path);
        if (!node.isDirectory || !node.children || node.children.length === 0) {
          return isSelected;
        }

        let hasSelectedDescendant = false;
        for (const child of node.children) {
          if (collectExpanded(child, depth + 1)) {
            hasSelectedDescendant = true;
          }
        }
        const shouldExpand = depth === 0 || isSelected || hasSelectedDescendant;
        if (shouldExpand) {
          nextExpanded.add(node.path);
        }

        return isSelected || hasSelectedDescendant;
      };

      nextTree.forEach((node) => {
        collectExpanded(node, 0);
      });
      if (!isCurrentRequest()) {
        return;
      }
      setExpanded(nextExpanded);
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      logError('Failed to load backup selector tree', error, { basePath });
      setTree([]);
      setExpanded(new Set());
      setLoadError(true);
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      treeRequestGenerationRef.current += 1;
    };
  }, []);

  const initialSelected = useMemo(
    () => new Set(normalizeBackupSources(initial.selected)),
    [initial.selected],
  );

  useEffect(() => {
    void loadTree(initial.serverPath, initialSelected);
  }, [initial.serverPath, initialSelected, loadTree]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void tauriListen<IncomingPayload>('backup-selector:load', (payload) => {
      const nextSelected = new Set(normalizeBackupSources(payload.selected));
      setServerPath(payload.serverPath);
      setSelected(nextSelected);
      void loadTree(payload.serverPath, nextSelected);
    }).then((dispose) => {
      if (cancelled) {
        dispose();
        return;
      }
      unlisten = dispose;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [loadTree]);

  const handleToggleNode = useCallback(
    (node: SelectorNode, checked: boolean) => {
      setSelected((previous) => {
        const next = new Set(previous);
        if (checked) {
          setNodeSelection(node, true, next);
        } else {
          const selectedAncestorPath = findSelectedAncestorPath(node.path, previous);
          if (selectedAncestorPath) {
            const selectedAncestor = findNodeByPath(tree, selectedAncestorPath);
            if (selectedAncestor) {
              expandSelectionForExclusion(selectedAncestor, node, next);
            } else {
              clearNodeSelection(node, next);
            }
          } else {
            clearNodeSelection(node, next);
          }
        }
        return new Set(normalizeBackupSources(Array.from(next)));
      });
    },
    [tree],
  );

  const toggleExpanded = (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setExpanded(next);
  };

  const handleSelectAll = () => {
    setSelected(new Set(tree.map((node) => node.path)));
  };

  const handleClear = () => {
    setSelected(new Set());
  };

  const requestClose = useCallback(async () => {
    try {
      await currentWindow.close();
    } catch (error) {
      logError('Failed to close backup selector window directly', error, { serverPath });
      try {
        await emit('backup-selector:close-request', {
          serverPath,
        });
      } catch (emitError) {
        logError('Failed to emit backup selector close request', emitError, { serverPath });
      }
    }
  }, [currentWindow, serverPath]);

  const handleApply = async () => {
    if (!serverPath) {
      return;
    }

    setSaving(true);
    try {
      await emit('backup-selector:apply', {
        serverPath,
        paths: normalizeBackupSources(Array.from(selected)),
      });
      await requestClose();
    } finally {
      setSaving(false);
    }
  };

  const renderNode = (node: SelectorNode, depth: number) => {
    const selectionState = selectionStateMap.get(node.path) ?? 'unchecked';
    const isExpanded = expanded.has(node.path);
    const hasChildren = Boolean(node.children && node.children.length > 0);

    return (
      <div key={node.path} className={styles.node} data-selection-state={selectionState}>
        <div className={styles.row} style={{ paddingInlineStart: `${depth * 16 + 4}px` }}>
          {node.isDirectory ? (
            <button
              type="button"
              className={styles.expander}
              aria-expanded={isExpanded}
              onClick={() => toggleExpanded(node.path)}
              aria-label={
                isExpanded
                  ? t('backupSelector.ariaCollapseDirectory')
                  : t('backupSelector.ariaExpandDirectory')
              }
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          ) : (
            <span className={styles.expanderSpacer} aria-hidden="true" />
          )}

          <Checkbox
            aria-label={`${node.name} (${node.path})`}
            checked={selectionState === 'mixed' ? 'indeterminate' : selectionState === 'checked'}
            onCheckedChange={(checked) => handleToggleNode(node, checked === true)}
          />

          <span className={styles.kindIcon} aria-hidden="true">
            {node.isDirectory ? (
              isExpanded ? (
                <FolderOpen size={14} />
              ) : (
                <Folder size={14} />
              )
            ) : (
              <File size={14} />
            )}
          </span>

          <span className={styles.name}>{node.name}</span>
          <span className={styles.size}>{formatSize(node.size, t, locale)}</span>
        </div>

        {node.isDirectory && isExpanded && hasChildren && (
          <div role="group">{node.children?.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.window} data-testid="backup-selector-window">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('backupSelector.title')}</h1>
          <p className={styles.subtitle}>{t('backupSelector.subtitle')}</p>
        </div>
        <div className={styles.path}>
          <HardDrive size={14} aria-hidden="true" />
          <span className={styles.pathText}>
            {serverPath || t('backupSelector.serverPathNotSet')}
          </span>
        </div>
      </header>

      <div className={styles.toolbar}>
        <p className={styles.count} aria-live="polite">
          <SquareCheckBig size={14} aria-hidden="true" />
          <span>{t('backupSelector.selectionCount', { count: selected.size })}</span>
        </p>
        <div className={styles.toolbarActions}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleSelectAll}
            disabled={loading || tree.length === 0}
          >
            {t('backupSelector.selectAll')}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleClear}>
            {t('backupSelector.clearAll')}
          </Button>
        </div>
      </div>

      <div className={styles.treePanel}>
        {loading ? (
          <Skeleton label={t('backupSelector.loading')} lines={6} />
        ) : loadError ? (
          <div className={styles.errorState}>
            <Alert tone="danger" title={t('backupSelector.loadFailed')} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadTree(serverPath, selected)}
            >
              {t('backupSelector.retry')}
            </Button>
          </div>
        ) : tree.length === 0 ? (
          <EmptyState
            title={t('backupSelector.empty')}
            description={t('backupSelector.emptyDescription')}
          />
        ) : (
          <div role="tree" aria-label={t('backupSelector.treeLabel')}>
            {tree.map((node) => renderNode(node, 0))}
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void requestClose()}
          disabled={saving}
        >
          {t('backupSelector.cancel')}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void handleApply()}
          disabled={saving || selected.size === 0}
        >
          {saving ? t('backupSelector.saving') : t('backupSelector.apply')}
        </Button>
      </footer>
    </div>
  );
}
