import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChevronRight, File, Folder, FolderOpen, HardDrive, SquareCheckBig } from 'lucide-react';
import {
  type InputHTMLAttributes,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from '../../i18n';
import { normalizeBackupSources } from '../../lib/backup-commands';
import { logError } from '../../lib/error-utils';
import { listFilesWithMetadata } from '../../lib/file-commands';
import { tauriListen } from '../../lib/tauri-api';
import { Button } from './ui/Button';

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

const formatSize = (bytes: number) => {
  if (bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
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

function SelectionCheckbox({
  checked,
  mixed,
  onChange,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { mixed: boolean }) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = mixed;
    }
  }, [mixed]);

  return (
    <input ref={checkboxRef} {...props} checked={checked} onChange={onChange} type="checkbox" />
  );
}

export default function BackupTargetSelectorWindow() {
  const { t } = useTranslation();
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
      setLoading(false);
      return;
    }

    setLoading(true);
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
    const checked = selectionState === 'checked';
    const mixed = selectionState === 'mixed';
    const isExpanded = expanded.has(node.path);
    const hasChildren = Boolean(node.children && node.children.length > 0);

    return (
      <div
        key={node.path}
        className={`backup-selector-window__node ${selectionState !== 'unchecked' ? 'is-selected' : ''}`}
        data-selection-state={selectionState}
      >
        <div
          className="backup-selector-window__node-row"
          style={{ paddingLeft: `${depth * 16 + 10}px` }}
        >
          {node.isDirectory ? (
            <button
              type="button"
              className="backup-selector-window__expander"
              onClick={() => toggleExpanded(node.path)}
              aria-label={
                isExpanded
                  ? t('backupSelector.ariaCollapseDirectory')
                  : t('backupSelector.ariaExpandDirectory')
              }
            >
              <ChevronRight className={isExpanded ? 'is-open' : ''} size={14} />
            </button>
          ) : (
            <span className="backup-selector-window__expander-spacer" />
          )}

          <SelectionCheckbox
            type="checkbox"
            className="backup-selector-window__node-checkbox"
            checked={checked}
            mixed={mixed}
            onChange={(event) => handleToggleNode(node, event.target.checked)}
            aria-label={`${node.name} (${node.path})`}
            aria-checked={mixed ? 'mixed' : checked}
          />

          <span className="backup-selector-window__kind-icon">
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

          <span className="backup-selector-window__name">{node.name}</span>
          <span className="backup-selector-window__size">{formatSize(node.size)}</span>
        </div>

        {node.isDirectory && isExpanded && hasChildren && (
          <div className="backup-selector-window__node-children">
            {node.children?.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="backup-selector-window flex h-screen flex-col gap-3 p-4">
      <header className="backup-selector-window__header">
        <div>
          <h1 className="backup-selector-window__title">{t('backupSelector.title')}</h1>
          <p className="backup-selector-window__subtitle">{t('backupSelector.subtitle')}</p>
        </div>
        <div className="backup-selector-window__server-path" title={serverPath}>
          <HardDrive size={14} />
          <span>{serverPath || t('backupSelector.serverPathNotSet')}</span>
        </div>
      </header>

      <div className="backup-selector-window__toolbar">
        <div className="backup-selector-window__selection-count">
          <SquareCheckBig size={14} />
          <span>{t('backupSelector.selectionCount', { count: selected.size })}</span>
        </div>
        <div className="backup-selector-window__toolbar-actions">
          <Button type="button" variant="secondary" onClick={handleSelectAll}>
            {t('backupSelector.selectAll')}
          </Button>
          <Button type="button" variant="secondary" onClick={handleClear}>
            {t('backupSelector.clearAll')}
          </Button>
        </div>
      </div>

      <div className="backup-selector-window__tree-panel">
        {loading ? (
          <div className="backup-selector-window__empty">{t('backupSelector.loading')}</div>
        ) : tree.length === 0 ? (
          <div className="backup-selector-window__empty">{t('backupSelector.empty')}</div>
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>

      <footer className="backup-selector-window__footer">
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
