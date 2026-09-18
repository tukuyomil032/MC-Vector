import {
  AlertTriangle,
  Check,
  LocateFixed,
  Map as MapIcon,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useTranslation } from '../../i18n';
import {
  type MapBridgeState,
  type MapPlayer,
  type MapStatus,
  type MapTileReadyEvent,
  getMapWorldInfo,
  getMapStatus,
  getMapTile,
  isMapAssetWarningState,
  normalizeMapTileBytes,
  onMapBridgeStatus,
  onMapPlayersUpdated,
  onMapTileInvalidated,
  onMapTileReady,
  pauseMap,
  repairMapBridge,
  removeMapComponent,
  requestMapRender,
  restoreMap,
  resolveMapTileDiagnosticState,
  selectMapAsset,
} from '../../lib/map-commands';
import type { MinecraftServer } from '../shared/server declaration';
import { Button } from './ui/Button';

interface MapViewProps {
  server: MinecraftServer;
  onSave: (updatedServer: MinecraftServer) => Promise<void>;
  onOpenSettings: () => void;
}

type MapTab = 'map' | 'management';

interface PanState {
  x: number;
  y: number;
}

interface MapCenter {
  x: number;
  z: number;
}

interface MapTile {
  x: number;
  y: number;
  url: string;
}

const MAX_ZOOM = 8;
const TILE_SIZE = 256;
const TILES_PER_VIEW = 3;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function bridgeIcon(state: MapBridgeState) {
  return state === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />;
}

function revokeTiles(tiles: MapTile[]) {
  tiles.forEach((tile) => URL.revokeObjectURL(tile.url));
}

export default function MapView({ server, onSave, onOpenSettings }: MapViewProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<MapTab>('map');
  const [status, setStatus] = useState<MapStatus | null>(null);
  const [players, setPlayers] = useState<MapPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [tiles, setTiles] = useState<MapTile[]>([]);
  const [tileStates, setTileStates] = useState<Record<string, MapTileReadyEvent>>({});
  const [requestedTileKeys, setRequestedTileKeys] = useState<string[]>([]);
  const [tileError, setTileError] = useState<string | null>(null);
  const [isTileLoading, setIsTileLoading] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [mapCenter, setMapCenter] = useState<MapCenter>({ x: 0, z: 0 });
  const [tileRevision, setTileRevision] = useState(0);
  const [pan, setPan] = useState<PanState>({ x: 0, y: 0 });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [worldHasTerrain, setWorldHasTerrain] = useState<boolean | null>(null);
  const tilesRef = useRef<MapTile[]>([]);
  const centerInitializedRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; pan: PanState }>();

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextStatus = await getMapStatus(server.id);
      setStatus(nextStatus);
      setStatusError(null);
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(null);
      setStatusError(message);
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    setStatus(null);
    setPlayers([]);
    setStatusError(null);
    revokeTiles(tilesRef.current);
    tilesRef.current = [];
    setTiles([]);
    setTileError(null);
    setTileStates({});
    setRequestedTileKeys([]);
    setIsTileLoading(false);
    setMapCenter({ x: 0, z: 0 });
    setWorldHasTerrain(null);
    centerInitializedRef.current = false;
    setTileRevision(0);
    setPan({ x: 0, y: 0 });
    void refreshStatus();
    void getMapWorldInfo(server.id, 'overworld')
      .then((info) => {
        if (centerInitializedRef.current) {
          return;
        }
        setWorldHasTerrain(info.hasTerrain);
        setMapCenter({ x: info.centerX, z: info.centerZ });
        setZoom(info.recommendedZoom);
        centerInitializedRef.current = true;
      })
      .catch(() => {
        setWorldHasTerrain(false);
      });
    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 5000);
    return () => {
      window.clearInterval(interval);
      revokeTiles(tilesRef.current);
      tilesRef.current = [];
    };
  }, [refreshStatus, server.id]);

  useEffect(() => {
    let cancelled = false;
    let unlistenBridge: (() => void) | undefined;
    let unlistenPlayers: (() => void) | undefined;
    let unlistenTiles: (() => void) | undefined;
    let unlistenTileReady: (() => void) | undefined;

    void onMapBridgeStatus((event) => {
      if (event.serverId !== server.id) {
        return;
      }
      setStatus((current) =>
        current
          ? {
              ...current,
              bridge: event.status,
              lastHeartbeat: event.lastHeartbeat ?? current.lastHeartbeat ?? null,
              message: event.message ?? current.message ?? null,
            }
          : current,
      );
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }
      unlistenBridge = unlisten;
    });

    void onMapPlayersUpdated((event) => {
      if (event.serverId !== server.id || !event.message?.players) {
        return;
      }
      setPlayers(event.message.players);
      if (!centerInitializedRef.current) {
        const player = event.message.players.find(
          (candidate) =>
            candidate.dimension === 'overworld' || candidate.dimension === 'minecraft:overworld',
        );
        if (player) {
          setMapCenter({ x: player.x, z: player.z });
          centerInitializedRef.current = true;
        }
      }
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }
      unlistenPlayers = unlisten;
    });

    void onMapTileInvalidated((event) => {
      if (event.serverId === server.id) {
        setTileRevision((revision) => revision + 1);
      }
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }
      unlistenTiles = unlisten;
    });

    void onMapTileReady((event) => {
      if (event.serverId !== server.id || event.worldId !== 'overworld') {
        return;
      }
      const key = `${event.zoom}:${event.tileX}:${event.tileY}`;
      setTileStates((current) => ({ ...current, [key]: event }));
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }
      unlistenTileReady = unlisten;
    });

    return () => {
      cancelled = true;
      unlistenBridge?.();
      unlistenPlayers?.();
      unlistenTiles?.();
      unlistenTileReady?.();
    };
  }, [server.id]);

  useEffect(() => {
    if (
      statusError ||
      status?.configState !== 'valid' ||
      (status?.component !== 'active' && status?.component !== 'waiting_restart')
    ) {
      revokeTiles(tilesRef.current);
      tilesRef.current = [];
      setTiles([]);
      setTileStates({});
      setRequestedTileKeys([]);
      setIsTileLoading(false);
      return;
    }
    let cancelled = false;
    const nextUrls: string[] = [];
    const previousTiles = tilesRef.current;
    setIsTileLoading(true);
    setTileError(null);
    setTileStates({});
    const blocksPerPixel = 2 ** (MAX_ZOOM - zoom);
    const tileWorldSize = TILE_SIZE * blocksPerPixel;
    const centerTileX = Math.floor(mapCenter.x / tileWorldSize);
    const centerTileY = Math.floor(mapCenter.z / tileWorldSize);
    const requests = Array.from({ length: TILES_PER_VIEW }, (_, row) =>
      Array.from({ length: TILES_PER_VIEW }, (_, column) => ({
        x: centerTileX + column - 1,
        y: centerTileY + row - 1,
      })),
    ).flat();
    setRequestedTileKeys(requests.map(({ x, y }) => `${zoom}:${x}:${y}`));

    void requestMapRender(server.id, 'overworld', {
      centerX: mapCenter.x,
      centerZ: mapCenter.z,
      zoom,
      width: 768,
      height: 512,
    }).catch(() => {
      // Individual tile requests below still provide the image and diagnostic
      // state. Prefetch failures are surfaced by getMapTile or map-tile-ready.
    });

    void Promise.all(
      requests.map(async ({ x, y }): Promise<MapTile | null> => {
        try {
          const buffer = await getMapTile(server.id, 'overworld', zoom, x, y);
          if (cancelled) {
            return null;
          }
          const bytes = normalizeMapTileBytes(buffer);
          if (
            bytes.length < 8 ||
            !bytes.slice(0, 8).every((value, index) => value === PNG_SIGNATURE[index])
          ) {
            throw new Error('Map tile response was not a valid PNG');
          }
          const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
          nextUrls.push(url);
          return { x, y, url };
        } catch (error) {
          if (!cancelled) {
            setTileError(error instanceof Error ? error.message : String(error));
          }
          return null;
        }
      }),
    ).then((loadedTiles) => {
      if (!cancelled) {
        const merged = new Map(previousTiles.map((tile) => [`${tile.x}:${tile.y}`, tile]));
        loadedTiles.forEach((tile) => {
          if (!tile) {
            return;
          }
          const key = `${tile.x}:${tile.y}`;
          const previous = merged.get(key);
          if (previous && previous.url !== tile.url) {
            URL.revokeObjectURL(previous.url);
          }
          merged.set(key, tile);
        });
        setTiles([...merged.values()]);
        nextUrls.length = 0;
        setIsTileLoading(false);
      }
    });

    return () => {
      cancelled = true;
      nextUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [
    mapCenter.x,
    mapCenter.z,
    server.id,
    status?.component,
    status?.configState,
    statusError,
    tileRevision,
    zoom,
  ]);

  const component = status?.component ?? 'absent';
  const bridge = status?.bridge ?? 'not_applicable';

  const componentLabel = (value: MapStatus['component']): string => {
    switch (value) {
      case 'active':
        return t('map.status.active');
      case 'paused':
        return t('map.status.paused');
      case 'waiting_restart':
        return t('map.status.waitingRestart');
      case 'remove_pending':
        return t('map.status.removePending');
      case 'conflict':
        return t('map.status.conflict');
      default:
        return t('map.status.absent');
    }
  };

  const bridgeLabel = (value: MapBridgeState): string => {
    switch (value) {
      case 'connecting':
        return t('map.bridge.connecting');
      case 'connected':
        return t('map.bridge.connected');
      case 'disconnected':
        return t('map.bridge.disconnected');
      case 'incompatible':
        return t('map.bridge.incompatible');
      case 'error':
        return t('map.bridge.error');
      default:
        return t('map.bridge.notApplicable');
    }
  };

  const assetLabel = (value: MapStatus['assetState']): string => {
    switch (value) {
      case 'missing':
        return t('map.asset.missing');
      case 'detected':
      case 'auto_detected':
        return t('map.asset.detected');
      case 'configured':
      case 'user_selected':
        return t('map.asset.configured');
      case 'version_mismatch':
        return t('map.asset.versionMismatch');
      case 'fallback':
        return t('map.asset.fallback');
      case 'invalid':
        return t('map.asset.invalid');
      default:
        return t('map.asset.notApplicable');
    }
  };

  const formatHeartbeat = (timestamp: number | null | undefined) => {
    if (!timestamp) {
      return t('map.management.noHeartbeat');
    }
    return new Date(timestamp * 1000).toLocaleTimeString();
  };

  const runAction = async (
    action: () => Promise<MapStatus>,
    successMessage: string,
    after?: (nextStatus: MapStatus) => Promise<void>,
  ) => {
    if (isActing) {
      return;
    }
    setIsActing(true);
    try {
      const nextStatus = await action();
      setStatus(nextStatus);
      setStatusError(null);
      setLoadError(null);
      await after?.(nextStatus);
      toast.success(successMessage);
    } catch (error) {
      toast.error(
        `${t('map.toast.failed')}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsActing(false);
    }
  };

  const handlePause = () => {
    void runAction(() => pauseMap(server.id), t('map.toast.paused'));
  };

  const handleRestore = () => {
    void runAction(() => restoreMap(server.id), t('map.toast.restored'));
  };

  const handleRepairBridge = () => {
    void runAction(() => repairMapBridge(server.id), t('map.toast.bridgeRepaired'));
  };

  const handleSelectAsset = async () => {
    const selection = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: 'Minecraft assets',
          extensions: ['jar', 'zip'],
        },
      ],
    });
    if (typeof selection !== 'string') {
      return;
    }
    setIsActing(true);
    try {
      await selectMapAsset(server.id, selection);
      await refreshStatus();
      setTileRevision((revision) => revision + 1);
      toast.success(t('map.toast.assetsSelected'));
    } catch (error) {
      toast.error(
        t('map.toast.failed') + ': ' + (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setIsActing(false);
    }
  };

  const handleRemove = () => {
    void runAction(
      () => removeMapComponent(server.id),
      server.status === 'online' ? t('map.toast.removePending') : t('map.toast.removed'),
      async (nextStatus) => {
        if (nextStatus.component === 'absent') {
          await onSave({ ...server, map: { consent: 'disabled' } });
        }
      },
    );
    setConfirmRemove(false);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pan,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setPan({
      x: drag.pan.x + event.clientX - drag.startX,
      y: drag.pan.y + event.clientY - drag.startY,
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = undefined;
    }
  };

  const handleRecenter = () => {
    const player = players.find(
      (candidate) =>
        candidate.dimension === 'overworld' || candidate.dimension === 'minecraft:overworld',
    );
    setMapCenter(
      player
        ? { x: player.x, z: player.z }
        : worldHasTerrain === false
          ? { x: 0, z: 0 }
          : mapCenter,
    );
    centerInitializedRef.current = true;
    setPan({ x: 0, y: 0 });
  };

  const handleMapWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((value) => (event.deltaY < 0 ? Math.min(MAX_ZOOM, value + 1) : Math.max(0, value - 1)));
  };

  const handleMapKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setZoom((value) => Math.min(MAX_ZOOM, value + 1));
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      setZoom((value) => Math.max(0, value - 1));
    } else if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown'
    ) {
      event.preventDefault();
      const step = 64 * 2 ** (MAX_ZOOM - zoom);
      setMapCenter((center) => ({
        x: center.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
        z: center.z + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
      }));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleRecenter();
    }
  };

  const blocksPerPixel = 2 ** (MAX_ZOOM - zoom);
  const tileWorldSize = TILE_SIZE * blocksPerPixel;
  const tilePosition = (coordinate: number, center: number) =>
    50 + ((coordinate * tileWorldSize - center) / (TILES_PER_VIEW * tileWorldSize)) * 100;
  const playerPosition = (coordinate: number, center: number) =>
    50 + ((coordinate - center) / (TILES_PER_VIEW * tileWorldSize)) * 100;

  const isManagedArtifactAvailable =
    component === 'active' || component === 'paused' || component === 'waiting_restart';
  const artifactIsActive = status?.artifact === 'active';
  const artifactIsPaused = status?.artifact === 'paused';
  const assetState = status?.assetState ?? 'not_applicable';
  const viewportTileStates = requestedTileKeys
    .map((key) => tileStates[key])
    .filter((tile): tile is MapTileReadyEvent => Boolean(tile));
  const terrainTiles = viewportTileStates.filter((tile) => tile.hasTerrain);
  const allReceivedTilesEmpty =
    requestedTileKeys.length > 0 &&
    requestedTileKeys.every((key) => Boolean(tileStates[key])) &&
    terrainTiles.length === 0 &&
    !isTileLoading;
  const canvasBlocked =
    isLoading ||
    Boolean(statusError) ||
    !status ||
    status.configState !== 'valid' ||
    !isManagedArtifactAvailable;

  const tileDiagnosticState = resolveMapTileDiagnosticState({
    assetState,
    isLoading: isTileLoading,
    requestedTileKeys,
    statusError,
    tileError,
    tileStates,
  });
  const tileDiagnosticMessage = viewportTileStates.find(
    (tile) => tile.renderState === tileDiagnosticState && tile.message,
  )?.message;

  const tileDiagnostic = (() => {
    switch (tileDiagnosticState) {
      case 'asset_missing':
        return {
          title: t('map.surface.tileState.assetMissing'),
          description: t('map.surface.tileState.assetMissingDescription'),
        };
      case 'error':
        return {
          title: t('map.surface.tileState.error'),
          description:
            tileError ?? tileDiagnosticMessage ?? t('map.surface.tileState.errorDescription'),
        };
      case 'paper_chunk_unavailable':
        return {
          title: t('map.surface.tileState.paperChunkUnavailable'),
          description: t('map.surface.tileState.paperChunkUnavailableDescription'),
        };
      case 'empty':
        return {
          title: t('map.surface.noGeneratedTerrain'),
          description: t('map.surface.noGeneratedTerrainDescription'),
        };
      case 'stale':
        return {
          title: t('map.surface.tileState.stale'),
          description: t('map.surface.tileState.staleDescription'),
        };
      case 'rendering':
        return {
          title: t('map.surface.tileState.rendering'),
          description: t('map.surface.tileState.renderingDescription'),
        };
      default:
        return null;
    }
  })();

  return (
    <div className="map-view" data-testid="map-view">
      <div className="map-view__header">
        <div>
          <div className="map-view__eyebrow">{server.name}</div>
          <h2 className="map-view__title">
            <MapIcon size={22} aria-hidden="true" />
            {t('map.title')}
          </h2>
        </div>
        <div className="map-view__header-actions">
          <span className={`map-view__status map-view__status--${component}`}>
            <span className="map-view__status-dot" aria-hidden="true" />
            {componentLabel(component)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refreshStatus()}
            disabled={isLoading}
            title={t('map.actions.refresh')}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
            <span className="sr-only">{t('map.actions.refresh')}</span>
          </Button>
        </div>
      </div>

      <div className="map-view__tabs" role="tablist" aria-label={t('map.title')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'map'}
          className={`map-view__tab ${tab === 'map' ? 'is-active' : ''}`}
          onClick={() => setTab('map')}
        >
          <MapIcon size={15} aria-hidden="true" />
          {t('map.tabMap')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'management'}
          className={`map-view__tab ${tab === 'management' ? 'is-active' : ''}`}
          onClick={() => setTab('management')}
        >
          <Settings2 size={15} aria-hidden="true" />
          {t('map.tabManagement')}
        </button>
      </div>

      {loadError && (
        <div className="map-view__notice map-view__notice--error" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>
            {statusError ? t('map.bridge.statusError') : loadError}
            {status?.message && <small>{status.message}</small>}
          </span>
        </div>
      )}

      {tab === 'map' ? (
        <div className="map-view__workspace">
          <section className="map-view__surface-panel" aria-label={t('map.tabMap')}>
            <div className="map-view__surface-toolbar">
              <div className="map-view__world-label">
                <span className="map-view__world-dot" aria-hidden="true" />
                {t('map.surface.overworld')}
              </div>
              <div className="map-view__surface-toolbar-actions">
                {isTileLoading && (
                  <span className="map-view__tile-status" role="status">
                    {t('map.surface.loadingTiles')}
                  </span>
                )}
                <span className="map-view__zoom-label">
                  {t('map.surface.zoom', { level: zoom })}
                </span>
                <button
                  type="button"
                  className="map-view__icon-button"
                  onClick={() => setZoom((value) => Math.max(0, value - 1))}
                  aria-label={t('map.actions.zoomOut')}
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="map-view__icon-button"
                  onClick={() => setZoom((value) => Math.min(8, value + 1))}
                  aria-label={t('map.actions.zoomIn')}
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="map-view__icon-button"
                  onClick={handleRecenter}
                  aria-label={t('map.actions.recenter')}
                >
                  <LocateFixed size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div
              className="map-view__canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleMapWheel}
              onKeyDown={handleMapKeyDown}
              tabIndex={0}
              role="button"
              aria-label={t('map.surface.overworld')}
            >
              <div
                className="map-view__canvas-content"
                style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))` }}
              >
                {tiles.length > 0 ? (
                  tiles.map((tile) => (
                    <img
                      src={tile.url}
                      alt={t('map.surface.tileAlt')}
                      className="map-view__tile"
                      key={`${tile.x}:${tile.y}`}
                      style={{
                        left: `${tilePosition(tile.x, mapCenter.x)}%`,
                        top: `${tilePosition(tile.y, mapCenter.z)}%`,
                      }}
                    />
                  ))
                ) : !allReceivedTilesEmpty ? (
                  <div className="map-view__empty-state" role={tileError ? 'alert' : undefined}>
                    <MapIcon size={25} aria-hidden="true" />
                    <strong>
                      {statusError
                        ? t('map.bridge.statusError')
                        : tileError
                          ? t('map.surface.tileError')
                          : worldHasTerrain === false
                            ? t('map.surface.noGeneratedTerrain')
                            : isTileLoading
                              ? t('map.surface.loadingTiles')
                              : t('map.surface.noTile')}
                    </strong>
                    <span>
                      {statusError
                        ? t('map.bridge.statusErrorDescription')
                        : (tileError ?? t('map.surface.noTileDescription'))}
                    </span>
                  </div>
                ) : null}
                {allReceivedTilesEmpty && (
                  <div className="map-view__empty-state" role="status">
                    <MapIcon size={25} aria-hidden="true" />
                    <strong>{t('map.surface.noGeneratedTerrain')}</strong>
                    <span>{t('map.surface.noGeneratedTerrainDescription')}</span>
                  </div>
                )}
                {tileDiagnostic && !allReceivedTilesEmpty && tiles.length > 0 && (
                  <div
                    className={`map-view__tile-diagnostic map-view__tile-diagnostic--${tileDiagnosticState}`}
                    role={tileDiagnosticState === 'error' ? 'alert' : 'status'}
                  >
                    <strong>{tileDiagnostic.title}</strong>
                    <span>{tileDiagnostic.description}</span>
                  </div>
                )}
                {players.map((player) => (
                  <div
                    className="map-view__player-marker"
                    key={player.playerId}
                    style={{
                      left: `${playerPosition(player.x, mapCenter.x)}%`,
                      top: `${playerPosition(player.z, mapCenter.z)}%`,
                    }}
                    title={`${player.name} (${Math.round(player.x)}, ${Math.round(player.z)})`}
                  >
                    <span className="map-view__player-marker-dot" aria-hidden="true" />
                    <span className="map-view__player-marker-name">{player.name}</span>
                  </div>
                ))}
              </div>
              <div className="map-view__canvas-center" aria-hidden="true" />
              {canvasBlocked && (
                <div className="map-view__canvas-overlay">
                  <div className="map-view__canvas-overlay-card">
                    <MapIcon size={25} aria-hidden="true" />
                    <strong>
                      {isLoading
                        ? t('map.surface.loading')
                        : statusError
                          ? t('map.bridge.statusError')
                          : status?.configState !== 'valid'
                            ? t('map.bridge.configurationRequired')
                            : t('map.surface.placeholder')}
                    </strong>
                    <span>
                      {statusError
                        ? t('map.bridge.statusErrorDescription')
                        : status?.configState !== 'valid'
                          ? t('map.bridge.configurationRequiredDescription')
                          : t('map.surface.notAvailable')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {isMapAssetWarningState(assetState) && (
              <div className="map-view__notice map-view__notice--warning" role="status">
                <AlertTriangle size={17} aria-hidden="true" />
                <span>
                  {status?.assetMessage ??
                    (assetState === 'missing'
                      ? t('map.asset.missing')
                      : assetState === 'version_mismatch'
                        ? t('map.asset.versionMismatch')
                        : assetState === 'fallback'
                          ? t('map.asset.fallback')
                          : t('map.asset.invalid'))}
                  <Button variant="ghost" size="sm" onClick={() => void handleSelectAsset()}>
                    {t('map.asset.choose')}
                  </Button>
                </span>
              </div>
            )}

            <div className="map-view__surface-footer">
              <span>
                {players.length > 0
                  ? t('map.surface.playerCount', { count: players.length })
                  : t('map.surface.noPlayers')}
              </span>
              <span className="map-view__surface-hint">{t('map.featureDescription')}</span>
            </div>
          </section>

          <aside className="map-view__side-panel">
            <div className="map-view__side-card">
              <div className="map-view__side-card-heading">
                <span>{t('map.management.componentTitle')}</span>
                <span className={`map-view__compact-status map-view__compact-status--${bridge}`}>
                  {bridgeIcon(bridge)}
                  {bridgeLabel(bridge)}
                </span>
              </div>
              <p>{status?.message ?? t('map.management.componentDescription')}</p>
              <Button variant="secondary" size="sm" onClick={() => setTab('management')}>
                <Settings2 size={15} aria-hidden="true" />
                {t('map.tabManagement')}
              </Button>
            </div>

            <div className="map-view__side-card map-view__side-card--players">
              <div className="map-view__side-card-heading">
                <span>{t('map.surface.playerCount', { count: players.length })}</span>
                <button
                  type="button"
                  className="map-view__text-button"
                  onClick={handleRecenter}
                  disabled={players.length === 0}
                >
                  {t('map.actions.recenter')}
                </button>
              </div>
              {players.length === 0 ? (
                <p>{t('map.surface.noPlayers')}</p>
              ) : (
                <ul className="map-view__player-list">
                  {players.map((player) => (
                    <li key={player.playerId}>
                      <span className="map-view__player-list-dot" aria-hidden="true" />
                      <span>{player.name}</span>
                      <code>
                        {Math.round(player.x)}, {Math.round(player.z)}
                      </code>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="map-view__management">
          <section className="map-view__management-card">
            <div className="map-view__management-card-header">
              <div>
                <div className="map-view__eyebrow">{t('map.management.componentName')}</div>
                <h3>{t('map.management.componentTitle')}</h3>
              </div>
              <span className={`map-view__status map-view__status--${component}`}>
                <span className="map-view__status-dot" aria-hidden="true" />
                {componentLabel(component)}
              </span>
            </div>
            <p>{t('map.management.componentDescription')}</p>
            <div className="map-view__metadata-grid">
              <div>
                <span>{t('map.management.managed')}</span>
                <strong>
                  <Check size={14} aria-hidden="true" /> MC-Vector
                </strong>
              </div>
              <div>
                <span>{t('map.management.version')}</span>
                <strong>{status?.pluginVersion ?? '—'}</strong>
              </div>
              <div>
                <span>{t('map.management.protocol')}</span>
                <strong>v{status?.protocolVersion ?? 2}</strong>
              </div>
              <div>
                <span>{t('map.management.port')}</span>
                <strong>{status?.configuredPort ?? '—'}</strong>
              </div>
              <div>
                <span>{t('map.management.lastHeartbeat')}</span>
                <strong>{formatHeartbeat(status?.lastHeartbeat)}</strong>
              </div>
              <div>
                <span>{t('map.management.configState')}</span>
                <strong>{status?.configState ?? '—'}</strong>
              </div>
              <div>
                <span>{t('map.management.configReason')}</span>
                <strong>{status?.configReason ?? '—'}</strong>
              </div>
            </div>
            <p className="map-view__management-note">{t('map.management.paperPluginNote')}</p>
            <div className="map-view__asset-panel">
              <div>
                <span>{t('map.asset.title')}</span>
                <strong>{assetLabel(assetState)}</strong>
                {status?.assetSource && <code>{status.assetSource}</code>}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleSelectAsset()}
                disabled={isActing}
              >
                {t('map.asset.choose')}
              </Button>
            </div>
          </section>

          {component === 'absent' && (
            <div className="map-view__notice map-view__notice--warning">
              <AlertTriangle size={17} aria-hidden="true" />
              <span>{t('map.management.artifactMissing')}</span>
            </div>
          )}
          {component === 'paused' && (
            <div className="map-view__notice map-view__notice--warning">
              <Pause size={17} aria-hidden="true" />
              <span>{t('map.management.pausedDescription')}</span>
            </div>
          )}
          {component === 'waiting_restart' && (
            <div className="map-view__notice map-view__notice--warning">
              <RefreshCw size={17} aria-hidden="true" />
              <span>{t('map.management.restartRequired')}</span>
            </div>
          )}
          {component === 'remove_pending' && (
            <div className="map-view__notice map-view__notice--warning">
              <Trash2 size={17} aria-hidden="true" />
              <span>{t('map.management.removalDescription')}</span>
            </div>
          )}
          {component === 'conflict' && (
            <div className="map-view__notice map-view__notice--error">
              <X size={17} aria-hidden="true" />
              <span>{t('map.management.conflictDescription')}</span>
            </div>
          )}
          {status && status.configState !== 'valid' && component !== 'conflict' && (
            <div className="map-view__notice map-view__notice--warning" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              <span>
                {t('map.bridge.configurationRequiredDescription')}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRepairBridge}
                  disabled={isActing}
                >
                  {t('map.bridge.repair')}
                </Button>
              </span>
            </div>
          )}
          {statusError && (
            <div className="map-view__notice map-view__notice--error" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              <span>
                {t('map.bridge.statusErrorDescription')}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void refreshStatus()}
                  disabled={isLoading}
                >
                  {t('map.actions.refresh')}
                </Button>
              </span>
            </div>
          )}

          <div className="map-view__management-actions">
            {(component === 'paused' || (component === 'waiting_restart' && artifactIsPaused)) && (
              <Button variant="start" onClick={handleRestore} disabled={isActing}>
                <Play size={16} aria-hidden="true" />
                {t('map.actions.restore')}
              </Button>
            )}
            {(component === 'active' || (component === 'waiting_restart' && artifactIsActive)) && (
              <Button variant="secondary" onClick={handlePause} disabled={isActing}>
                <Pause size={16} aria-hidden="true" />
                {t('map.actions.pause')}
              </Button>
            )}
            {(isManagedArtifactAvailable ||
              (component === 'remove_pending' && server.status !== 'online')) && (
              <Button variant="danger" onClick={() => setConfirmRemove(true)} disabled={isActing}>
                <Trash2 size={16} aria-hidden="true" />
                {t('map.actions.remove')}
              </Button>
            )}
            <Button variant="ghost" onClick={onOpenSettings}>
              <Settings2 size={16} aria-hidden="true" />
              {t('map.actions.openSettings')}
            </Button>
          </div>
        </div>
      )}

      {confirmRemove && (
        <div className="map-view__confirm-backdrop" role="presentation">
          <div
            className="map-view__confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-remove-title"
          >
            <div className="map-view__confirm-icon" aria-hidden="true">
              <Trash2 size={20} />
            </div>
            <h3 id="map-remove-title">{t('map.management.removeConfirmTitle')}</h3>
            <p>{t('map.management.removeConfirmDescription')}</p>
            <div className="map-view__confirm-actions">
              <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                {t('map.actions.cancel')}
              </Button>
              <Button variant="danger" onClick={handleRemove} disabled={isActing}>
                {t('map.actions.confirmRemove')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
