import { emit } from '@tauri-apps/api/event';
import { ChevronRight, File, Folder, FolderOpen, HardDrive, SquareCheckBig } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../i18n';
import { listFilesWithMetadata } from '../../lib/file-commands';
import { tauriListen } from '../../lib/tauri-api';

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

export default function BackupTargetSelectorWindow() {
  const { t } = useTranslation();
  const initial = useMemo(parseInitialPayload, []);
  const [serverPath, setServerPath] = useState(initial.serverPath);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial.selected));
  const [tree, setTree] = useState<SelectorNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadTree = async (basePath: string, preselected: Set<string>) => {
    if (!basePath) {
      setTree([]);
      return;
    }

    setLoading(true);
    try {
      const walk = async (absolutePath: string, relativeRoot = ''): Promise<SelectorNode[]> => {
        const entries = await listFilesWithMetadata(absolutePath);

        const nodes = await Promise.all(
          entries
            .filter((entry) => !(relativeRoot.length === 0 && entry.name === 'backups'))
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
      setTree(nextTree);

      const nextExpanded = new Set<string>();
      const collectExpanded = (node: SelectorNode) => {
        if (!node.isDirectory) {
          return;
        }

        if (node.children && node.children.length > 0) {
          if (preselected.has(node.path)) {
            nextExpanded.add(node.path);
          }
          const hasSelectedChild = node.children.some((child) => preselected.has(child.path));
          if (hasSelectedChild) {
            nextExpanded.add(node.path);
          }

          node.children.forEach(collectExpanded);
        }
      };

      nextTree.forEach(collectExpanded);
      setExpanded(nextExpanded);
    } catch (error) {
      console.error(error);
      setTree([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialSelected = new Set(initial.selected);
    void loadTree(initial.serverPath, initialSelected);
  }, [initial.selected, initial.serverPath]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void tauriListen<IncomingPayload>('backup-selector:load', (payload) => {
      const nextSelected = new Set(payload.selected);
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
  }, []);

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

  const handleToggleNode = (node: SelectorNode, checked: boolean) => {
    const next = new Set(selected);
    setNodeSelection(node, checked, next);
    setSelected(next);
  };

  const toggleExpanded = (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setExpanded(next);
  };

  const collectAll = (nodes: SelectorNode[], bucket: Set<string>) => {
    for (const node of nodes) {
      bucket.add(node.path);
      if (node.children) {
        collectAll(node.children, bucket);
      }
    }
  };

  const handleSelectAll = () => {
    const all = new Set<string>();
    collectAll(tree, all);
    setSelected(all);
  };

  const handleClear = () => {
    setSelected(new Set());
  };

  const handleApply = async () => {
    if (!serverPath) {
      return;
    }

    setSaving(true);
    try {
      await emit('backup-selector:apply', {
        serverPath,
        paths: Array.from(selected).sort((left, right) => left.localeCompare(right)),
      });
      window.close();
    } finally {
      setSaving(false);
    }
  };

  const renderNode = (node: SelectorNode, depth: number) => {
    const checked = selected.has(node.path);
    const isExpanded = expanded.has(node.path);
    const hasChildren = Boolean(node.children && node.children.length > 0);

    return (
      <div
        key={node.path}
        className={`backup-selector-window__node ${checked ? 'is-selected' : ''}`}
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

          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => handleToggleNode(node, event.target.checked)}
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
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="backup-selector-window">
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
          <button type="button" className="btn-secondary" onClick={handleSelectAll}>
            {t('backupSelector.selectAll')}
          </button>
          <button type="button" className="btn-secondary" onClick={handleClear}>
            {t('backupSelector.clearAll')}
          </button>
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
        <button
          type="button"
          className="btn-secondary"
          onClick={() => window.close()}
          disabled={saving}
        >
          {t('backupSelector.cancel')}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleApply()}
          disabled={saving || selected.size === 0}
        >
          {saving ? t('backupSelector.saving') : t('backupSelector.apply')}
        </button>
      </footer>
    </div>
  );
}
