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

export interface MapRenderProgressEvent {
  serverId: string;
  worldId: string;
  zoom: number;
  tileX: number;
  tileY: number;
  state: MapTileRenderState;
  completed: number;
  total: number;
  message?: string | null;
}

export function isMapAssetWarningState(state: MapAssetState): boolean {
  return ['missing', 'invalid', 'version_mismatch', 'fallback'].includes(state);
}

export function resolveMapTileDiagnosticState(input: {
  assetState: MapAssetState;
  hasPreviousTiles?: boolean;
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
    return input.hasPreviousTiles ? 'stale' : 'rendering';
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

export interface MapViewport {
  centerX: number;
  centerZ: number;
  zoom: number;
  width?: number;
  height?: number;
}

export interface MapRenderRequestResult {
  requested: number;
  accepted: number;
}
