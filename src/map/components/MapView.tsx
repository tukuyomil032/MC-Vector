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
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useTranslation } from '../../i18n';
import {
  getMapAssetCandidates,
  getMapAssetStatus,
  createMapMarker,
  deleteMapMarker,
  getMapMarkers,
  getMapWorldInfo,
  getMapWorlds,
  getMapStatus,
  getMapTile,
  pauseMap,
  repairMapBridge,
  removeMapComponent,
  restoreMap,
  selectMapAsset,
} from '../api/map-commands';
import { useMapEvents } from '../hooks/use-map-events';
import { useMapPlayerInterpolation } from '../hooks/use-map-player-interpolation';
import type { MinecraftServer } from '../../renderer/shared/server declaration';
import { Button } from '../../renderer/components/ui/Button';
import {
  type MapBridgeState,
  type MapAssetCandidate,
  type MapAssetCandidateSnapshot,
  type MapAssetStatus,
  type MapMarker,
  type MapPlayer,
  type MapRenderProgressEvent,
  type MapStatus,
  type MapTileReadyEvent,
  type MapWorldInfo,
  clearMapAssetStatus,
  getValidMapWorldBorder,
  getMapAssetCandidateSourcePath,
  isMapAssetCandidateCurrent,
  isMapAssetWarningState,
  isMapAssetSelectionSuccessful,
  isMapMarkerInputValid,
  isMapTileRequestReady,
  mapMarkersForWorld,
  mergeMapAssetStatus,
  normalizeMapTileBytes,
  parseMapCoordinateTarget,
  resolveMapTileDiagnosticState,
  type MapWorldEntry,
} from '../state/map-types';
import { createMapRequestCoordinator } from '../state/map-request-coordinator';

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

interface AssetStatusRefreshResult {
  status: MapAssetStatus | null;
  error: string | null;
}

const MAX_ZOOM = 8;
const TILE_SIZE = 256;
const TILES_PER_VIEW = 3;
const VIEWPORT_DEBOUNCE_MS = 120;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function bridgeIcon(state: MapBridgeState) {
  return state === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />;
}

function playerBelongsToWorld(player: MapPlayer, worldId: string): boolean {
  const dimension = player.dimension.toLowerCase();
  switch (worldId) {
    case 'overworld':
      return dimension === 'overworld' || dimension === 'minecraft:overworld';
    case 'world_nether':
      return dimension === 'nether' || dimension === 'minecraft:the_nether';
    case 'world_the_end':
      return dimension === 'end' || dimension === 'minecraft:the_end';
    default:
      return dimension === worldId.toLowerCase();
  }
}

function revokeTiles(tiles: MapTile[]) {
  tiles.forEach((tile) => URL.revokeObjectURL(tile.url));
}

export default function MapView({ server, onSave, onOpenSettings }: MapViewProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<MapTab>('map');
  const [status, setStatus] = useState<MapStatus | null>(null);
  const [assetStatus, setAssetStatus] = useState<MapAssetStatus | null>(null);
  const [assetCandidates, setAssetCandidates] = useState<MapAssetCandidate[]>([]);
  const [assetCandidatesError, setAssetCandidatesError] = useState<string | null>(null);
  const [worlds, setWorlds] = useState<MapWorldEntry[]>([
    {
      worldId: 'overworld',
      label: 'Overworld',
      dimension: 'minecraft:overworld',
      available: true,
    },
  ]);
  const [worldId, setWorldId] = useState('overworld');
  const [players, setPlayers] = useState<MapPlayer[]>([]);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [markerName, setMarkerName] = useState('');
  const [markerGroup, setMarkerGroup] = useState('default');
  const [markerColor, setMarkerColor] = useState('#22c55e');
  const [markerError, setMarkerError] = useState<string | null>(null);
  const [isMarkerActing, setIsMarkerActing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [assetStatusError, setAssetStatusError] = useState<string | null>(null);
  const [tiles, setTiles] = useState<MapTile[]>([]);
  const [tileStates, setTileStates] = useState<Record<string, MapTileReadyEvent>>({});
  const [requestedTileKeys, setRequestedTileKeys] = useState<string[]>([]);
  const [tileError, setTileError] = useState<string | null>(null);
  const [isTileLoading, setIsTileLoading] = useState(false);
  const [renderProgress, setRenderProgress] = useState<MapRenderProgressEvent | null>(null);
  const [zoom, setZoom] = useState(2);
  const [mapCenter, setMapCenter] = useState<MapCenter>({ x: 0, z: 0 });
  const [tileRevision, setTileRevision] = useState(0);
  const [pan, setPan] = useState<PanState>({ x: 0, y: 0 });
  const [coordinateX, setCoordinateX] = useState('');
  const [coordinateZ, setCoordinateZ] = useState('');
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [worldHasTerrain, setWorldHasTerrain] = useState<boolean | null>(null);
  const [worldInfo, setWorldInfo] = useState<MapWorldInfo | null>(null);
  const tilesRef = useRef<MapTile[]>([]);
  const mapRequestsRef = useRef(createMapRequestCoordinator());
  const mapRequestGenerationRef = useRef(0);
  const assetStatusRequestRef = useRef<Promise<AssetStatusRefreshResult> | null>(null);
  const assetCandidatesRequestRef = useRef<Promise<MapAssetCandidate[] | null> | null>(null);
  const assetCandidatesContextRef = useRef<MapAssetCandidateSnapshot>({
    serverId: server.id,
    generation: 0,
    candidates: [],
  });
  const centerInitializedRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; pan: PanState }>();

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  const applyAssetStatus = useCallback((nextStatus: MapAssetStatus, clearError = true) => {
    setAssetStatus(nextStatus);
    if (clearError) {
      setAssetStatusError(null);
    }
    setStatus((current) => mergeMapAssetStatus(current, nextStatus));
  }, []);

  const refreshAssetStatus = useCallback(async (): Promise<AssetStatusRefreshResult> => {
    const existing = assetStatusRequestRef.current;
    if (existing) {
      return existing;
    }

    const generation = mapRequestGenerationRef.current;
    const requestServerId = server.id;
    const operation = getMapAssetStatus(requestServerId)
      .then((nextStatus) => {
        if (mapRequestGenerationRef.current !== generation) {
          return { status: null, error: null };
        }
        applyAssetStatus(nextStatus);
        return { status: nextStatus, error: null };
      })
      .catch((error) => {
        if (mapRequestGenerationRef.current !== generation) {
          return { status: null, error: null };
        }
        const message = error instanceof Error ? error.message : String(error);
        setAssetStatus(null);
        setAssetStatusError(message);
        setStatus((current) => clearMapAssetStatus(current, message));
        return { status: null, error: message };
      });
    const request = operation.finally(() => {
      if (assetStatusRequestRef.current === request) {
        assetStatusRequestRef.current = null;
      }
    });
    assetStatusRequestRef.current = request;
    return request;
  }, [applyAssetStatus, server.id]);

  const refreshAssetCandidates = useCallback(async (): Promise<MapAssetCandidate[] | null> => {
    const existing = assetCandidatesRequestRef.current;
    if (existing) {
      return existing;
    }

    const generation = mapRequestGenerationRef.current;
    const requestServerId = server.id;
    const operation = getMapAssetCandidates(requestServerId)
      .then((nextCandidates) => {
        if (mapRequestGenerationRef.current !== generation) {
          return null;
        }
        setAssetCandidates(nextCandidates);
        setAssetCandidatesError(null);
        assetCandidatesContextRef.current = {
          serverId: requestServerId,
          generation,
          candidates: nextCandidates,
        };
        return nextCandidates;
      })
      .catch((error) => {
        if (mapRequestGenerationRef.current !== generation) {
          return null;
        }
        const message = error instanceof Error ? error.message : String(error);
        setAssetCandidates([]);
        setAssetCandidatesError(message);
        assetCandidatesContextRef.current = {
          serverId: requestServerId,
          generation,
          candidates: [],
        };
        return null;
      });
    const request = operation.finally(() => {
      if (assetCandidatesRequestRef.current === request) {
        assetCandidatesRequestRef.current = null;
      }
    });
    assetCandidatesRequestRef.current = request;
    return request;
  }, [server.id]);

  const refreshWorlds = useCallback(async () => {
    try {
      const nextWorlds = await getMapWorlds(server.id);
      if (nextWorlds.length > 0) {
        setWorlds(nextWorlds);
        setWorldId((current) =>
          nextWorlds.some((world) => world.worldId === current && world.available)
            ? current
            : (nextWorlds.find((world) => world.available)?.worldId ?? 'overworld'),
        );
      }
    } catch {
      // Keep the safe Overworld fallback when discovery is unavailable.
      setWorlds((current) =>
        current.length > 0
          ? current
          : [
              {
                worldId: 'overworld',
                label: 'Overworld',
                dimension: 'minecraft:overworld',
                available: true,
              },
            ],
      );
    }
  }, [server.id]);

  const refreshStatus = useCallback(
    async (refreshAssets = false) => {
      setIsLoading(true);
      try {
        const generation = mapRequestGenerationRef.current;
        const nextStatus = await getMapStatus(server.id);
        if (mapRequestGenerationRef.current !== generation) {
          return false;
        }
        setStatus(nextStatus);
        setStatusError(null);
        setLoadError(null);
        if (refreshAssets) {
          await refreshAssetStatus();
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(null);
        setStatusError(message);
        setLoadError(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [refreshAssetStatus, server.id],
  );

  useEffect(() => {
    mapRequestGenerationRef.current += 1;
    assetStatusRequestRef.current = null;
    assetCandidatesRequestRef.current = null;
    assetCandidatesContextRef.current = {
      serverId: server.id,
      generation: mapRequestGenerationRef.current,
      candidates: [],
    };
    setStatus(null);
    setAssetStatus(null);
    setAssetStatusError(null);
    setAssetCandidates([]);
    setAssetCandidatesError(null);
    mapRequestsRef.current.clear();
    setPlayers([]);
    setMarkers([]);
    setMarkerError(null);
    setStatusError(null);
    revokeTiles(tilesRef.current);
    tilesRef.current = [];
    setTiles([]);
    setTileError(null);
    setRenderProgress(null);
    setTileStates({});
    setRequestedTileKeys([]);
    setIsTileLoading(false);
    setWorldId('overworld');
    setWorlds([
      {
        worldId: 'overworld',
        label: 'Overworld',
        dimension: 'minecraft:overworld',
        available: true,
      },
    ]);
    setMapCenter({ x: 0, z: 0 });
    setWorldHasTerrain(null);
    setWorldInfo(null);
    centerInitializedRef.current = false;
    setTileRevision(0);
    setPan({ x: 0, y: 0 });
    void refreshStatus(true);
    void refreshAssetCandidates();
    void refreshWorlds();
    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 5000);
    return () => {
      window.clearInterval(interval);
      revokeTiles(tilesRef.current);
      tilesRef.current = [];
    };
  }, [refreshAssetCandidates, refreshStatus, refreshWorlds, server.id]);

  useEffect(() => {
    let cancelled = false;
    setMarkerError(null);
    void getMapMarkers(server.id)
      .then((nextMarkers) => {
        if (!cancelled) {
          setMarkers(nextMarkers);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMarkers([]);
          setMarkerError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [server.id]);

  useEffect(() => {
    let cancelled = false;
    centerInitializedRef.current = false;
    setWorldHasTerrain(null);
    setWorldInfo(null);
    setMapCenter({ x: 0, z: 0 });
    setPan({ x: 0, y: 0 });
    void getMapWorldInfo(server.id, worldId)
      .then((info) => {
        if (cancelled) {
          return;
        }
        setWorldInfo(info);
        setWorldHasTerrain(info.hasTerrain);
        setMapCenter({ x: info.centerX, z: info.centerZ });
        setZoom(info.recommendedZoom);
        centerInitializedRef.current = true;
      })
      .catch(() => {
        if (!cancelled) {
          setWorldInfo(null);
          setWorldHasTerrain(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [server.id, worldId]);

  useMapEvents({
    serverId: server.id,
    onBridgeStatus: (event) => {
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
    },
    onPlayersUpdated: (event) => {
      if (!event.message?.players) {
        return;
      }
      setPlayers(event.message.players);
      if (!centerInitializedRef.current) {
        const player = event.message.players.find((candidate) =>
          playerBelongsToWorld(candidate, worldId),
        );
        if (player) {
          setMapCenter({ x: player.x, z: player.z });
          centerInitializedRef.current = true;
        }
      }
    },
    onTileInvalidated: () => {
      setTileRevision((revision) => revision + 1);
    },
    onTileReady: (event) => {
      if (event.worldId !== worldId) {
        return;
      }
      const key = `${event.zoom}:${event.tileX}:${event.tileY}`;
      setTileStates((current) => ({ ...current, [key]: event }));
    },
    onRenderProgress: (event) => {
      if (event.worldId !== worldId) {
        return;
      }
      setRenderProgress(event);
      if (event.state === 'error' || event.state === 'paper_chunk_unavailable') {
        setTileError(event.message ?? `Map render reported ${event.state}`);
      }
    },
  });

  const diagnosticStatusError = statusError ?? assetStatusError;
  const mapTileRequestReady = isMapTileRequestReady(status, diagnosticStatusError);

  useEffect(() => {
    if (!mapTileRequestReady) {
      revokeTiles(tilesRef.current);
      tilesRef.current = [];
      setTiles([]);
      setTileStates({});
      setRequestedTileKeys([]);
      setIsTileLoading(false);
      setRenderProgress(null);
      return;
    }
    let cancelled = false;
    const nextUrls: string[] = [];
    const timeout = window.setTimeout(() => {
      const previousTiles = tilesRef.current;
      setIsTileLoading(true);
      setTileError(null);
      setRenderProgress(null);
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

      void Promise.all(
        requests.map(async ({ x, y }): Promise<MapTile | null> => {
          const tileKey = `${server.id}:${worldId}:${zoom}:${x}:${y}`;
          try {
            const bytes = await mapRequestsRef.current.requestTile(tileKey, async () => {
              const buffer = await getMapTile(server.id, worldId, zoom, x, y);
              const nextBytes = normalizeMapTileBytes(buffer);
              if (
                nextBytes.length < 8 ||
                !nextBytes.slice(0, 8).every((value, index) => value === PNG_SIGNATURE[index])
              ) {
                throw new Error('Map tile response was not a valid PNG');
              }
              return nextBytes;
            });
            if (cancelled) {
              return null;
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
    }, VIEWPORT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      nextUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [
    mapCenter.x,
    mapCenter.z,
    server.id,
    status?.component,
    status?.configState,
    status?.assetState,
    diagnosticStatusError,
    mapTileRequestReady,
    tileRevision,
    worldId,
    zoom,
  ]);

  const component = status?.component ?? 'absent';
  const bridge = status?.bridge ?? 'not_applicable';
  const selectedWorld = worlds.find((world) => world.worldId === worldId);
  const visiblePlayers = useMemo(
    () => players.filter((player) => playerBelongsToWorld(player, worldId)),
    [players, worldId],
  );
  const isManagedArtifactAvailable =
    component === 'active' || component === 'paused' || component === 'waiting_restart';
  const interpolatedPlayers = useMapPlayerInterpolation(
    visiblePlayers,
    worldId,
    isManagedArtifactAvailable,
  );
  const visibleMarkers = useMemo(() => mapMarkersForWorld(markers, worldId), [markers, worldId]);

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

  const handleRefresh = () => {
    void refreshStatus();
    void refreshAssetCandidates();
    void refreshWorlds();
  };

  const handleWorldChange = (nextWorldId: string) => {
    const nextWorld = worlds.find((world) => world.worldId === nextWorldId);
    if (!nextWorld?.available || nextWorld.worldId === worldId) {
      return;
    }
    revokeTiles(tilesRef.current);
    tilesRef.current = [];
    setTiles([]);
    setTileStates({});
    setRequestedTileKeys([]);
    setTileError(null);
    setRenderProgress(null);
    setWorldInfo(null);
    setWorldId(nextWorld.worldId);
    setTileRevision((revision) => revision + 1);
  };

  const handleCoordinateJump = () => {
    const target = parseMapCoordinateTarget(coordinateX, coordinateZ);
    if (!target) {
      setCoordinateError(t('map.surface.coordinateInvalid'));
      return;
    }
    setCoordinateError(null);
    setMapCenter(target);
    setPan({ x: 0, y: 0 });
    centerInitializedRef.current = true;
  };

  const handleCreateMarker = async () => {
    const input = {
      worldId,
      group: markerGroup.trim(),
      name: markerName.trim(),
      position: { x: mapCenter.x, y: 0, z: mapCenter.z },
      color: markerColor,
    };
    if (!isMapMarkerInputValid(input)) {
      setMarkerError(t('map.markers.invalidInput'));
      return;
    }
    setIsMarkerActing(true);
    setMarkerError(null);
    try {
      const marker = await createMapMarker(server.id, input);
      setMarkers((current) => [...current, marker]);
      setMarkerName('');
      toast.success(t('map.toast.markerCreated'));
    } catch (error) {
      setMarkerError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMarkerActing(false);
    }
  };

  const handleDeleteMarker = async (marker: MapMarker) => {
    setIsMarkerActing(true);
    setMarkerError(null);
    try {
      const deleted = await deleteMapMarker(server.id, marker.id);
      if (deleted) {
        setMarkers((current) => current.filter((candidate) => candidate.id !== marker.id));
        toast.success(t('map.toast.markerDeleted'));
      }
    } catch (error) {
      setMarkerError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMarkerActing(false);
    }
  };

  const handleAssetSelection = async (selection: string) => {
    setIsActing(true);
    try {
      const nextAssetStatus = await selectMapAsset(server.id, selection);
      applyAssetStatus(nextAssetStatus);
      const selectionWasRejected = !isMapAssetSelectionSuccessful(nextAssetStatus.state);
      const statusRefreshed = await refreshStatus();
      const assetRefresh = await refreshAssetStatus();
      await refreshAssetCandidates();

      if (selectionWasRejected) {
        applyAssetStatus(nextAssetStatus, false);
        const message = nextAssetStatus.message ?? assetLabel(nextAssetStatus.state);
        if (isMapAssetWarningState(nextAssetStatus.state)) {
          toast.warning(message);
        } else {
          toast.error(`${t('map.toast.failed')}: ${message}`);
        }
        return;
      }
      if (!statusRefreshed) {
        toast.error(`${t('map.toast.failed')}: ${t('map.bridge.statusError')}`);
        return;
      }
      if (assetRefresh.error || !assetRefresh.status) {
        toast.error(`${t('map.toast.failed')}: ${assetRefresh.error ?? t('map.asset.invalid')}`);
        return;
      }
      if (!isMapAssetSelectionSuccessful(assetRefresh.status.state)) {
        const message = assetRefresh.status.message ?? assetLabel(assetRefresh.status.state);
        if (isMapAssetWarningState(assetRefresh.status.state)) {
          toast.warning(message);
        } else {
          toast.error(`${t('map.toast.failed')}: ${message}`);
        }
        return;
      }
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
    if (typeof selection === 'string') {
      await handleAssetSelection(selection);
    }
  };

  const handleSelectCandidate = async (candidate: MapAssetCandidate) => {
    const currentContext = {
      serverId: server.id,
      generation: mapRequestGenerationRef.current,
    };
    if (!isMapAssetCandidateCurrent(candidate, assetCandidatesContextRef.current, currentContext)) {
      return;
    }
    const sourcePath = getMapAssetCandidateSourcePath(candidate);
    if (!sourcePath) {
      return;
    }
    await handleAssetSelection(sourcePath);
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
    const player = players.find((candidate) => playerBelongsToWorld(candidate, worldId));
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
  const validWorldBorder = getValidMapWorldBorder(worldInfo?.worldBorder);
  const worldBorderSizePercentage = validWorldBorder
    ? (validWorldBorder.size / (TILES_PER_VIEW * tileWorldSize)) * 100
    : 0;

  const artifactIsActive = status?.artifact === 'active';
  const artifactIsPaused = status?.artifact === 'paused';
  const assetState = assetStatusError
    ? 'invalid'
    : (assetStatus?.state ?? status?.assetState ?? 'not_applicable');
  const assetSource = assetStatusError ? null : (assetStatus?.sourcePath ?? status?.assetSource);
  const assetMessage = assetStatusError ?? assetStatus?.message ?? status?.assetMessage;
  const mapLoadError = loadError ?? statusError ?? assetStatusError;
  const viewportTileStates = requestedTileKeys
    .map((key) => tileStates[key])
    .filter((tile): tile is MapTileReadyEvent => Boolean(tile));
  const canvasBlocked =
    isLoading ||
    Boolean(diagnosticStatusError) ||
    !status ||
    status.configState !== 'valid' ||
    !isManagedArtifactAvailable;

  const tileDiagnosticState = resolveMapTileDiagnosticState({
    assetState,
    hasPreviousTiles: tiles.length > 0,
    isLoading: isTileLoading,
    requestedTileKeys,
    statusError: diagnosticStatusError,
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
  const progressPercentage = renderProgress
    ? Math.min(
        100,
        Math.max(
          0,
          renderProgress.total > 0 ? (renderProgress.completed / renderProgress.total) * 100 : 0,
        ),
      )
    : 0;

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
            onClick={handleRefresh}
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

      {mapLoadError && (
        <div className="map-view__notice map-view__notice--error" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>
            {statusError ? t('map.bridge.statusError') : mapLoadError}
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
                <select
                  className="map-view__world-select"
                  value={worldId}
                  onChange={(event) => handleWorldChange(event.target.value)}
                  aria-label={t('map.surface.overworld')}
                >
                  {worlds.map((world) => (
                    <option key={world.worldId} value={world.worldId} disabled={!world.available}>
                      {world.label}
                      {!world.available ? ' (unavailable)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <form
                className="map-view__coordinate-jump"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleCoordinateJump();
                }}
                aria-label={t('map.surface.coordinateJump')}
              >
                <label htmlFor="map-coordinate-x">{t('map.surface.coordinateX')}</label>
                <input
                  id="map-coordinate-x"
                  className="map-view__coordinate-input"
                  value={coordinateX}
                  onChange={(event) => setCoordinateX(event.target.value)}
                  inputMode="decimal"
                  placeholder="X"
                  aria-label={t('map.surface.coordinateX')}
                  aria-invalid={coordinateError ? 'true' : undefined}
                />
                <label htmlFor="map-coordinate-z">{t('map.surface.coordinateZ')}</label>
                <input
                  id="map-coordinate-z"
                  className="map-view__coordinate-input"
                  value={coordinateZ}
                  onChange={(event) => setCoordinateZ(event.target.value)}
                  inputMode="decimal"
                  placeholder="Z"
                  aria-label={t('map.surface.coordinateZ')}
                  aria-invalid={coordinateError ? 'true' : undefined}
                />
                <Button type="submit" variant="ghost" size="sm">
                  {t('map.surface.coordinateJumpAction')}
                </Button>
              </form>
              {coordinateError && (
                <span className="map-view__coordinate-error" role="alert">
                  {coordinateError}
                </span>
              )}
              <div className="map-view__surface-toolbar-actions">
                {isTileLoading && (
                  <span className="map-view__tile-status" role="status">
                    {t('map.surface.loadingTiles')}
                    {renderProgress && renderProgress.total > 0 && (
                      <span className="map-view__tile-status-progress">
                        {renderProgress.completed}/{renderProgress.total}
                      </span>
                    )}
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
              aria-label={selectedWorld?.label ?? t('map.surface.overworld')}
            >
              {isTileLoading && renderProgress && (
                <div
                  className="map-view__tile-progress"
                  role="progressbar"
                  aria-label={t('map.surface.loadingTiles')}
                  aria-valuemin={0}
                  aria-valuemax={renderProgress.total || 1}
                  aria-valuenow={renderProgress.completed}
                >
                  <span
                    className="map-view__tile-progress-value"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              )}
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
                ) : !canvasBlocked && tileDiagnostic ? (
                  <div
                    className={`map-view__empty-state map-view__empty-state--diagnostic map-view__empty-state--${tileDiagnosticState}`}
                    role={tileDiagnosticState === 'error' ? 'alert' : 'status'}
                  >
                    <MapIcon size={25} aria-hidden="true" />
                    <strong>{tileDiagnostic.title}</strong>
                    <span>{tileDiagnostic.description}</span>
                  </div>
                ) : !canvasBlocked ? (
                  <div className="map-view__empty-state" role={tileError ? 'alert' : undefined}>
                    <MapIcon size={25} aria-hidden="true" />
                    <strong>
                      {diagnosticStatusError
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
                      {diagnosticStatusError
                        ? t('map.bridge.statusErrorDescription')
                        : (tileError ?? t('map.surface.noTileDescription'))}
                    </span>
                  </div>
                ) : null}
                {tileDiagnostic && !canvasBlocked && tiles.length > 0 && (
                  <div
                    className={`map-view__tile-diagnostic map-view__tile-diagnostic--${tileDiagnosticState}`}
                    role={tileDiagnosticState === 'error' ? 'alert' : 'status'}
                  >
                    <strong>{tileDiagnostic.title}</strong>
                    <span>{tileDiagnostic.description}</span>
                  </div>
                )}
                {validWorldBorder && (
                  <div
                    className="map-view__world-border"
                    role="img"
                    aria-label={t('map.surface.worldBorder')}
                    style={{
                      left: `${playerPosition(
                        validWorldBorder.centerX - validWorldBorder.size / 2,
                        mapCenter.x,
                      )}%`,
                      top: `${playerPosition(
                        validWorldBorder.centerZ - validWorldBorder.size / 2,
                        mapCenter.z,
                      )}%`,
                      width: `${worldBorderSizePercentage}%`,
                      height: `${worldBorderSizePercentage}%`,
                    }}
                  />
                )}
                {visibleMarkers.map((marker) => (
                  <div
                    className="map-view__marker"
                    key={marker.id}
                    role="img"
                    aria-label={`${marker.name} (${Math.round(marker.position.x)}, ${Math.round(marker.position.z)})`}
                    title={`${marker.name} (${Math.round(marker.position.x)}, ${Math.round(marker.position.z)})`}
                    style={{
                      left: `${playerPosition(marker.position.x, mapCenter.x)}%`,
                      top: `${playerPosition(marker.position.z, mapCenter.z)}%`,
                    }}
                  >
                    <span
                      className="map-view__marker-dot"
                      aria-hidden="true"
                      style={{ backgroundColor: marker.color }}
                    />
                    <span className="map-view__marker-name">{marker.name}</span>
                  </div>
                ))}
                {interpolatedPlayers.map((player) => (
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
                        : diagnosticStatusError
                          ? t('map.bridge.statusError')
                          : status?.configState !== 'valid'
                            ? t('map.bridge.configurationRequired')
                            : t('map.surface.placeholder')}
                    </strong>
                    <span>
                      {diagnosticStatusError
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
                  {assetMessage ??
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
                {interpolatedPlayers.length > 0
                  ? t('map.surface.playerCount', { count: interpolatedPlayers.length })
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
                <span>{t('map.surface.playerCount', { count: interpolatedPlayers.length })}</span>
                <button
                  type="button"
                  className="map-view__text-button"
                  onClick={handleRecenter}
                  disabled={interpolatedPlayers.length === 0}
                >
                  {t('map.actions.recenter')}
                </button>
              </div>
              {interpolatedPlayers.length === 0 ? (
                <p>{t('map.surface.noPlayers')}</p>
              ) : (
                <ul className="map-view__player-list">
                  {interpolatedPlayers.map((player) => (
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
          <section className="map-view__management-card map-view__marker-management">
            <div className="map-view__management-card-header">
              <div>
                <div className="map-view__eyebrow">{t('map.markers.overlays')}</div>
                <h3>{t('map.markers.title')}</h3>
              </div>
              <span className="map-view__compact-status">
                {t('map.markers.visibleCount', { count: visibleMarkers.length })}
              </span>
            </div>
            <p>{t('map.markers.description')}</p>
            <form
              className="map-view__marker-form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateMarker();
              }}
            >
              <label>
                {t('map.markers.name')}
                <input
                  value={markerName}
                  onChange={(event) => setMarkerName(event.target.value)}
                  placeholder={t('map.markers.namePlaceholder')}
                  maxLength={256}
                  required
                />
              </label>
              <label>
                {t('map.markers.group')}
                <input
                  value={markerGroup}
                  onChange={(event) => setMarkerGroup(event.target.value)}
                  maxLength={128}
                  required
                />
              </label>
              <label className="map-view__marker-color-field">
                {t('map.markers.color')}
                <input
                  type="color"
                  value={markerColor}
                  onChange={(event) => setMarkerColor(event.target.value)}
                  aria-label={t('map.markers.colorAriaLabel')}
                />
              </label>
              <div className="map-view__marker-form-footer">
                <span>
                  {t('map.markers.location', {
                    world: selectedWorld?.label ?? worldId,
                    x: Math.round(mapCenter.x),
                    z: Math.round(mapCenter.z),
                  })}
                </span>
                <Button type="submit" variant="secondary" size="sm" disabled={isMarkerActing}>
                  {t('map.markers.add')}
                </Button>
              </div>
            </form>
            {markerError && (
              <div className="map-view__asset-error" role="alert">
                {markerError}
              </div>
            )}
            {visibleMarkers.length > 0 ? (
              <ul className="map-view__marker-list">
                {visibleMarkers.map((marker) => (
                  <li key={marker.id}>
                    <span
                      className="map-view__marker-list-dot"
                      aria-hidden="true"
                      style={{ backgroundColor: marker.color }}
                    />
                    <span className="map-view__marker-list-copy">
                      <strong>{marker.name}</strong>
                      <small>
                        {marker.group} · {Math.round(marker.position.x)},{' '}
                        {Math.round(marker.position.z)}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="map-view__icon-button"
                      onClick={() => void handleDeleteMarker(marker)}
                      disabled={isMarkerActing}
                      aria-label={t('map.markers.delete', { name: marker.name })}
                      title={t('map.markers.delete', { name: marker.name })}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="map-view__management-note">{t('map.markers.noMarkers')}</p>
            )}
          </section>
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
                {assetSource && <code>{assetSource}</code>}
                {assetStatusError && (
                  <span role="alert" className="map-view__asset-error">
                    {assetStatusError}
                  </span>
                )}
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
            {assetStatus && (
              <dl className="map-view__asset-details">
                <div>
                  <dt>state</dt>
                  <dd>{assetStatus.state}</dd>
                </div>
                <div>
                  <dt>sourcePath</dt>
                  <dd>{assetStatus.sourcePath ?? '—'}</dd>
                </div>
                <div>
                  <dt>identity</dt>
                  <dd>{assetStatus.identity ?? '—'}</dd>
                </div>
                <div>
                  <dt>blockstateCount</dt>
                  <dd>{assetStatus.blockstateCount}</dd>
                </div>
                <div>
                  <dt>modelCount</dt>
                  <dd>{assetStatus.modelCount}</dd>
                </div>
                <div>
                  <dt>textureCount</dt>
                  <dd>{assetStatus.textureCount}</dd>
                </div>
                <div>
                  <dt>animatedTextureCount</dt>
                  <dd>{assetStatus.animatedTextureCount}</dd>
                </div>
                <div>
                  <dt>minecraftVersion</dt>
                  <dd>{assetStatus.minecraftVersion ?? '—'}</dd>
                </div>
                <div>
                  <dt>quality</dt>
                  <dd>{assetStatus.quality}</dd>
                </div>
                <div>
                  <dt>unresolvedBlockstateCount</dt>
                  <dd>{assetStatus.unresolvedBlockstateCount}</dd>
                </div>
                <div>
                  <dt>message</dt>
                  <dd>{assetStatus.message ?? '—'}</dd>
                </div>
              </dl>
            )}
            <section className="map-view__asset-candidates" aria-label="Map asset candidates">
              <div className="map-view__asset-panel">
                <div>
                  <span>Detected candidates</span>
                  <strong>{assetCandidates.length}</strong>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isLoading || isActing}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Refresh candidates
                </Button>
              </div>
              {assetCandidatesError && (
                <div className="map-view__notice map-view__notice--error" role="alert">
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>Candidate discovery failed: {assetCandidatesError}</span>
                </div>
              )}
              {assetCandidates.length === 0 && !assetCandidatesError && (
                <p className="map-view__management-note">No asset candidates detected.</p>
              )}
              {assetCandidates.length > 0 && (
                <ul className="map-view__asset-candidates-list">
                  {assetCandidates.map((candidate) => {
                    const sourcePath = getMapAssetCandidateSourcePath(candidate);
                    const isSelectable = candidate.state === 'valid' && sourcePath !== null;
                    const candidateKey = [
                      candidate.launcher,
                      candidate.launcherRoot,
                      candidate.instanceId ?? '',
                      candidate.sourceIdentity ?? candidate.clientJar?.identity ?? '',
                    ].join(':');
                    return (
                      <li key={candidateKey}>
                        <dl className="map-view__asset-details">
                          <div>
                            <dt>launcher</dt>
                            <dd>{candidate.launcher}</dd>
                          </div>
                          <div>
                            <dt>version</dt>
                            <dd>{candidate.minecraftVersion ?? '—'}</dd>
                          </div>
                          <div>
                            <dt>state</dt>
                            <dd>{candidate.state}</dd>
                          </div>
                          <div>
                            <dt>clientJar</dt>
                            <dd>{candidate.clientJar?.path ?? '—'}</dd>
                          </div>
                          <div>
                            <dt>resourcePacks</dt>
                            <dd>
                              {candidate.resourcePacks.length > 0
                                ? candidate.resourcePacks
                                    .map((resourcePack) => resourcePack.path)
                                    .join(', ')
                                : '—'}
                            </dd>
                          </div>
                          <div>
                            <dt>message</dt>
                            <dd>{candidate.message ?? '—'}</dd>
                          </div>
                        </dl>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleSelectCandidate(candidate)}
                          disabled={!isSelectable || isActing}
                        >
                          Use candidate
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
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
                <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={isLoading}>
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
