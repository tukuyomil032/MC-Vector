import { emit } from '@tauri-apps/api/event';
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  GripVertical,
  HardDrive,
  Minus,
  Plus,
  RotateCcw,
  SquareCheckBig,
} from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

type SelectorViewMode = 'tree' | 'graph';
type GraphDraggableKind = 'group' | 'node';

interface GraphOffset {
  x: number;
  y: number;
}

type GraphOffsetMap = Record<string, GraphOffset>;

interface GraphPanState {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
}

interface GraphDragState {
  pointerId: number;
  kind: GraphDraggableKind;
  path: string;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
}

const GRAPH_ZOOM_DEFAULT = 1;
const GRAPH_ZOOM_MIN = 0.5;
const GRAPH_ZOOM_MAX = 2.5;
const GRAPH_ZOOM_STEP = 0.1;

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

const clampGraphZoom = (zoom: number) => {
  return Math.min(GRAPH_ZOOM_MAX, Math.max(GRAPH_ZOOM_MIN, zoom));
};

const getGraphOffset = (offsets: GraphOffsetMap, path: string): GraphOffset => {
  return offsets[path] ?? { x: 0, y: 0 };
};

const pruneOffsets = (offsets: GraphOffsetMap, validPaths: Set<string>) => {
  const next: GraphOffsetMap = {};
  Object.entries(offsets).forEach(([path, offset]) => {
    if (validPaths.has(path)) {
      next[path] = offset;
    }
  });
  return next;
};

const isInteractiveElement = (target: EventTarget | null) => {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest('button, input, select, textarea, a, [data-graph-drag-handle]'));
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
  const [viewMode, setViewMode] = useState<SelectorViewMode>('tree');
  const [graphZoom, setGraphZoom] = useState(GRAPH_ZOOM_DEFAULT);
  const [graphNodeOffsets, setGraphNodeOffsets] = useState<GraphOffsetMap>({});
  const [graphGroupOffsets, setGraphGroupOffsets] = useState<GraphOffsetMap>({});
  const [isGraphPanning, setIsGraphPanning] = useState(false);
  const [activeGraphDragId, setActiveGraphDragId] = useState<string | null>(null);
  const graphViewportRef = useRef<HTMLDivElement | null>(null);
  const graphPanRef = useRef<GraphPanState | null>(null);
  const graphDragRef = useRef<GraphDragState | null>(null);

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

  useEffect(() => {
    if (viewMode === 'graph') {
      return;
    }
    graphPanRef.current = null;
    graphDragRef.current = null;
    setIsGraphPanning(false);
    setActiveGraphDragId(null);
  }, [viewMode]);

  useEffect(() => {
    const validGroupPaths = new Set<string>();
    const validNodePaths = new Set<string>();
    const collectPaths = (node: SelectorNode, isRoot: boolean) => {
      validNodePaths.add(node.path);
      if (isRoot) {
        validGroupPaths.add(node.path);
      }
      node.children?.forEach((child) => collectPaths(child, false));
    };

    tree.forEach((root) => collectPaths(root, true));
    setGraphGroupOffsets((previous) => pruneOffsets(previous, validGroupPaths));
    setGraphNodeOffsets((previous) => pruneOffsets(previous, validNodePaths));
  }, [tree]);

  const updateGraphZoom = (delta: number, focus?: { clientX: number; clientY: number }) => {
    const viewport = graphViewportRef.current;
    if (!viewport) {
      setGraphZoom((previous) => clampGraphZoom(previous + delta));
      return;
    }

    setGraphZoom((previousZoom) => {
      const nextZoom = clampGraphZoom(previousZoom + delta);
      if (Math.abs(nextZoom - previousZoom) < Number.EPSILON) {
        return previousZoom;
      }

      if (focus) {
        const bounds = viewport.getBoundingClientRect();
        const pointerX = focus.clientX - bounds.left;
        const pointerY = focus.clientY - bounds.top;
        const contentX = pointerX + viewport.scrollLeft;
        const contentY = pointerY + viewport.scrollTop;
        const zoomRatio = nextZoom / previousZoom;

        requestAnimationFrame(() => {
          viewport.scrollLeft = contentX * zoomRatio - pointerX;
          viewport.scrollTop = contentY * zoomRatio - pointerY;
        });
      }

      return nextZoom;
    });
  };

  const resetGraphView = () => {
    setGraphZoom(GRAPH_ZOOM_DEFAULT);
    setGraphNodeOffsets({});
    setGraphGroupOffsets({});
    const viewport = graphViewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  };

  const handleGraphWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (viewMode !== 'graph' || loading || tree.length === 0) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY < 0 ? GRAPH_ZOOM_STEP : -GRAPH_ZOOM_STEP;
    updateGraphZoom(direction, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  const handleGraphPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (viewMode !== 'graph' || event.button !== 0 || isInteractiveElement(event.target)) {
      return;
    }

    const viewport = event.currentTarget;
    graphPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
    };
    setIsGraphPanning(true);
    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleGraphPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panState = graphPanRef.current;
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - panState.startX;
    const deltaY = event.clientY - panState.startY;
    const viewport = event.currentTarget;
    viewport.scrollLeft = panState.startScrollLeft - deltaX;
    viewport.scrollTop = panState.startScrollTop - deltaY;
  };

  const finishGraphPanning = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panState = graphPanRef.current;
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    graphPanRef.current = null;
    setIsGraphPanning(false);
  };

  const updateGraphOffset = (kind: GraphDraggableKind, path: string, offset: GraphOffset) => {
    if (kind === 'group') {
      setGraphGroupOffsets((previous) => ({ ...previous, [path]: offset }));
      return;
    }
    setGraphNodeOffsets((previous) => ({ ...previous, [path]: offset }));
  };

  const startGraphDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: GraphDraggableKind,
    path: string,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const offsetSource = kind === 'group' ? graphGroupOffsets : graphNodeOffsets;
    const initialOffset = getGraphOffset(offsetSource, path);
    graphDragRef.current = {
      pointerId: event.pointerId,
      kind,
      path,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: initialOffset.x,
      startOffsetY: initialOffset.y,
    };
    setActiveGraphDragId(`${kind}:${path}`);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveGraphDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = graphDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const deltaX = (event.clientX - dragState.startX) / graphZoom;
    const deltaY = (event.clientY - dragState.startY) / graphZoom;
    updateGraphOffset(dragState.kind, dragState.path, {
      x: dragState.startOffsetX + deltaX,
      y: dragState.startOffsetY + deltaY,
    });
  };

  const finishGraphDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = graphDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    graphDragRef.current = null;
    setActiveGraphDragId(null);
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
            className="backup-selector-window__node-checkbox"
            checked={checked}
            onChange={(event) => handleToggleNode(node, event.target.checked)}
            aria-label={`${node.name} (${node.path})`}
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

  const renderGraphNode = (node: SelectorNode) => {
    const checked = selected.has(node.path);
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = hasChildren ? expanded.has(node.path) : false;
    const childCount = node.children?.length ?? 0;
    const nodeOffset = getGraphOffset(graphNodeOffsets, node.path);
    const nodeDragId = `node:${node.path}`;
    const isDraggingNode = activeGraphDragId === nodeDragId;

    return (
      <li
        key={node.path}
        className={`backup-selector-window__graph-item ${isDraggingNode ? 'is-rearranging' : ''}`}
        style={{ transform: `translate(${nodeOffset.x}px, ${nodeOffset.y}px)` }}
      >
        <div className={`backup-selector-window__graph-card ${checked ? 'is-selected' : ''}`}>
          {hasChildren ? (
            <button
              type="button"
              className="backup-selector-window__graph-expander"
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
            <span className="backup-selector-window__graph-expander-spacer" />
          )}

          <input
            type="checkbox"
            className="backup-selector-window__node-checkbox"
            checked={checked}
            onChange={(event) => handleToggleNode(node, event.target.checked)}
            aria-label={`${node.name} (${node.path})`}
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

          <button
            type="button"
            className="backup-selector-window__graph-node-toggle"
            onClick={() => handleToggleNode(node, !checked)}
            title={node.path}
          >
            <span className="backup-selector-window__graph-node-name">{node.name}</span>
            <span className="backup-selector-window__graph-node-path">{node.path}</span>
          </button>

          {hasChildren && (
            <span className="backup-selector-window__graph-node-count">{childCount}</span>
          )}

          <button
            type="button"
            className="backup-selector-window__graph-drag-handle"
            data-graph-drag-handle
            aria-label={`Reposition ${node.name}`}
            title="Drag to reposition"
            onPointerDown={(event) => startGraphDrag(event, 'node', node.path)}
            onPointerMove={moveGraphDrag}
            onPointerUp={finishGraphDrag}
            onPointerCancel={finishGraphDrag}
          >
            <GripVertical size={14} />
          </button>

          <span className="backup-selector-window__size">{formatSize(node.size)}</span>
        </div>

        {hasChildren && isExpanded && (
          <ul className="backup-selector-window__graph-children">
            {node.children!.map((child) => renderGraphNode(child))}
          </ul>
        )}
      </li>
    );
  };

  const renderGraphGroup = (root: SelectorNode) => {
    const groupOffset = getGraphOffset(graphGroupOffsets, root.path);
    const groupDragId = `group:${root.path}`;
    const isDraggingGroup = activeGraphDragId === groupDragId;

    return (
      <section
        key={root.path}
        className={`backup-selector-window__graph-root ${isDraggingGroup ? 'is-rearranging' : ''}`}
        style={{ transform: `translate(${groupOffset.x}px, ${groupOffset.y}px)` }}
      >
        <header className="backup-selector-window__graph-root-header">
          <span className="backup-selector-window__graph-root-label" title={root.path}>
            {root.name}
          </span>
          <button
            type="button"
            className="backup-selector-window__graph-drag-handle"
            data-graph-drag-handle
            aria-label={`Reposition ${root.name} group`}
            title="Drag to reposition"
            onPointerDown={(event) => startGraphDrag(event, 'group', root.path)}
            onPointerMove={moveGraphDrag}
            onPointerUp={finishGraphDrag}
            onPointerCancel={finishGraphDrag}
          >
            <GripVertical size={14} />
          </button>
        </header>
        <ul className="backup-selector-window__graph-tree">{renderGraphNode(root)}</ul>
      </section>
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
        <div
          className="backup-selector-window__view-toggle"
          role="group"
          aria-labelledby="backup-selector-view-mode-label"
        >
          <span
            id="backup-selector-view-mode-label"
            className="backup-selector-window__view-toggle-label"
          >
            {t('backupSelector.viewMode')}
          </span>
          <button
            type="button"
            className={`backup-selector-window__view-btn ${viewMode === 'tree' ? 'is-active' : ''}`}
            onClick={() => setViewMode('tree')}
            aria-pressed={viewMode === 'tree'}
          >
            {t('backupSelector.viewTree')}
          </button>
          <button
            type="button"
            className={`backup-selector-window__view-btn ${viewMode === 'graph' ? 'is-active' : ''}`}
            onClick={() => setViewMode('graph')}
            aria-pressed={viewMode === 'graph'}
          >
            {t('backupSelector.viewGraph')}
          </button>
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

      {viewMode === 'graph' ? (
        <div
          ref={graphViewportRef}
          className={`backup-selector-window__graph-panel ${isGraphPanning ? 'is-panning' : ''}`}
          onWheel={handleGraphWheel}
          onPointerDown={handleGraphPointerDown}
          onPointerMove={handleGraphPointerMove}
          onPointerUp={finishGraphPanning}
          onPointerCancel={finishGraphPanning}
        >
          <div className="backup-selector-window__graph-controls">
            <button
              type="button"
              className="backup-selector-window__graph-control-btn"
              onClick={() => updateGraphZoom(-GRAPH_ZOOM_STEP)}
              disabled={graphZoom <= GRAPH_ZOOM_MIN}
              aria-label="Zoom out graph"
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              className="backup-selector-window__graph-control-btn"
              onClick={() => updateGraphZoom(GRAPH_ZOOM_STEP)}
              disabled={graphZoom >= GRAPH_ZOOM_MAX}
              aria-label="Zoom in graph"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className="backup-selector-window__graph-control-btn"
              onClick={resetGraphView}
              aria-label="Reset graph view"
            >
              <RotateCcw size={14} />
            </button>
            <span className="backup-selector-window__graph-zoom-value">
              {Math.round(graphZoom * 100)}%
            </span>
          </div>

          {loading ? (
            <div className="backup-selector-window__empty">{t('backupSelector.loading')}</div>
          ) : tree.length === 0 ? (
            <div className="backup-selector-window__empty">{t('backupSelector.empty')}</div>
          ) : (
            <div
              className="backup-selector-window__graph-canvas"
              style={{ transform: `scale(${graphZoom})` }}
            >
              {tree.map((node) => renderGraphGroup(node))}
            </div>
          )}
        </div>
      ) : (
        <div className="backup-selector-window__tree-panel">
          {loading ? (
            <div className="backup-selector-window__empty">{t('backupSelector.loading')}</div>
          ) : tree.length === 0 ? (
            <div className="backup-selector-window__empty">{t('backupSelector.empty')}</div>
          ) : (
            tree.map((node) => renderNode(node, 0))
          )}
        </div>
      )}

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
