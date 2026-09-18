import { type UnlistenFn, tauriInvoke, tauriListen } from './tauri-api';

export type MapComponentState =
  | 'absent'
  | 'active'
  | 'paused'
  | 'waiting_restart'
  | 'remove_pending'
  | 'conflict';

export type MapBridgeState =
  | 'not_applicable'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'incompatible'
  | 'error';

export type MapAssetState =
  | 'not_applicable'
  | 'missing'
  | 'detected'
  | 'configured'
  | 'auto_detected'
  | 'user_selected'
  | 'version_mismatch'
  | 'fallback'
  | 'invalid';

export type MapConfigState = 'valid' | 'missing' | 'invalid' | 'stale' | 'conflict';

export type MapTileRenderState =
  | 'terrain'
  | 'empty'
  | 'stale'
  | 'rendering'
  | 'error'
  | 'asset_missing'
  | 'bridge_incompatible'
  | 'paper_chunk_unavailable';

export interface MapStatus {
  serverId: string;
  component: MapComponentState;
  artifact?: 'active' | 'paused' | null;
  restartRequired?: boolean;
  bridge: MapBridgeState;
  configState: MapConfigState;
  configReason?: string | null;
  protocolVersion: number;
  pluginVersion?: string | null;
  configuredPort?: number | null;
  lastHeartbeat?: number | null;
  assetState: MapAssetState;
  assetSource?: string | null;
  assetIdentity?: string | null;
  assetMessage?: string | null;
  message?: string | null;
}

export interface MapAssetStatus {
  state: MapAssetState;
  sourcePath?: string | null;
  identity?: string | null;
  blockstateCount: number;
  modelCount: number;
  textureCount: number;
  message?: string | null;
}

export interface MapPlayer {
  playerId: string;
  name: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  capturedAt: number;
}

export interface MapPlayersUpdatedEvent {
  serverId: string;
  message?: {
    players?: MapPlayer[];
  };
}

export interface MapBridgeStatusEvent {
  serverId: string;
  status: MapBridgeState;
  lastHeartbeat?: number | null;
  message?: string | null;
}

export interface MapTileInvalidatedEvent {
  serverId: string;
  message?: {
    dimension?: string;
    chunkX?: number;
    chunkZ?: number;
  };
}

export interface MapTileReadyEvent {
  serverId: string;
  worldId: string;
  zoom: number;
  tileX: number;
  tileY: number;
  hasTerrain: boolean;
  renderState: MapTileRenderState;
  coverageRatio: number;
  renderedChunkCount: number;
  message?: string | null;
}

export function isMapAssetWarningState(state: MapAssetState): boolean {
  return ['missing', 'invalid', 'version_mismatch', 'fallback'].includes(state);
}

export function resolveMapTileDiagnosticState(input: {
  assetState: MapAssetState;
  isLoading: boolean;
  requestedTileKeys: string[];
  statusError: string | null;
  tileError: string | null;
  tileStates: Record<string, MapTileReadyEvent>;
}): MapTileRenderState | null {
  if (input.statusError) {
    return null;
  }
  const visibleStates = input.requestedTileKeys
    .map((key) => input.tileStates[key])
    .filter((tile): tile is MapTileReadyEvent => Boolean(tile));
  if (
    isMapAssetWarningState(input.assetState) ||
    visibleStates.some((tile) => tile.renderState === 'asset_missing')
  ) {
    return 'asset_missing';
  }
  if (input.tileError || visibleStates.some((tile) => tile.renderState === 'error')) {
    return 'error';
  }
  if (visibleStates.some((tile) => tile.renderState === 'paper_chunk_unavailable')) {
    return 'paper_chunk_unavailable';
  }
  if (
    input.requestedTileKeys.length > 0 &&
    input.requestedTileKeys.every((key) => Boolean(input.tileStates[key])) &&
    visibleStates.every((tile) => !tile.hasTerrain) &&
    !input.isLoading
  ) {
    return 'empty';
  }
  if (visibleStates.some((tile) => tile.renderState === 'stale')) {
    return 'stale';
  }
  if (input.isLoading || visibleStates.some((tile) => tile.renderState === 'rendering')) {
    return 'rendering';
  }
  return null;
}

export type MapTileBytes = number[] | ArrayBuffer | Uint8Array;

export function normalizeMapTileBytes(buffer: MapTileBytes): Uint8Array {
  if (buffer instanceof Uint8Array) {
    return buffer;
  }
  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer);
  }
  return Uint8Array.from(buffer);
}

export interface MapWorldInfo {
  worldId: string;
  hasTerrain: boolean;
  generatedChunkCount: number;
  minChunkX?: number | null;
  maxChunkX?: number | null;
  minChunkZ?: number | null;
  maxChunkZ?: number | null;
  centerX: number;
  centerZ: number;
  spawnX?: number | null;
  spawnY?: number | null;
  spawnZ?: number | null;
  dataVersion?: number | null;
  recommendedZoom: number;
}

export function getMapStatus(serverId: string): Promise<MapStatus> {
  return tauriInvoke('get_map_status', { serverId });
}

export function getMapWorldInfo(serverId: string, worldId: string): Promise<MapWorldInfo> {
  return tauriInvoke('get_map_world_info', { serverId, worldId });
}

export function repairMapBridge(serverId: string): Promise<MapStatus> {
  return tauriInvoke('repair_map_bridge', { serverId });
}

export function getMapAssetStatus(serverId: string): Promise<MapAssetStatus> {
  return tauriInvoke('get_map_asset_status', { serverId });
}

export function selectMapAsset(serverId: string, sourcePath: string): Promise<MapAssetStatus> {
  return tauriInvoke('select_map_asset', { serverId, sourcePath });
}

export function enableMap(serverId: string): Promise<MapStatus> {
  return tauriInvoke('enable_map', { serverId });
}

export function pauseMap(serverId: string): Promise<MapStatus> {
  return tauriInvoke('pause_map', { serverId });
}

export function restoreMap(serverId: string): Promise<MapStatus> {
  return tauriInvoke('restore_map', { serverId });
}

export function removeMapComponent(serverId: string): Promise<MapStatus> {
  return tauriInvoke('remove_map_component', { serverId });
}

export function getMapTile(
  serverId: string,
  worldId: string,
  zoom: number,
  tileX: number,
  tileY: number,
): Promise<MapTileBytes> {
  return tauriInvoke('get_map_tile', { serverId, worldId, zoom, tileX, tileY });
}

export function onMapBridgeStatus(
  callback: (event: MapBridgeStatusEvent) => void,
): Promise<UnlistenFn> {
  return tauriListen('map-bridge-status', callback);
}

export function onMapPlayersUpdated(
  callback: (event: MapPlayersUpdatedEvent) => void,
): Promise<UnlistenFn> {
  return tauriListen('map-players-updated', callback);
}

export function onMapTileInvalidated(
  callback: (event: MapTileInvalidatedEvent) => void,
): Promise<UnlistenFn> {
  return tauriListen('map-tile-invalidated', callback);
}

export function onMapTileReady(callback: (event: MapTileReadyEvent) => void): Promise<UnlistenFn> {
  return tauriListen('map-tile-ready', callback);
}
