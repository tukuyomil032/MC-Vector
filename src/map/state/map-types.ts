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
  sourcePath: string | null;
  identity: string | null;
  blockstateCount: number;
  modelCount: number;
  textureCount: number;
  animatedTextureCount: number;
  minecraftVersion: string | null;
  quality: string;
  unresolvedBlockstateCount: number;
  message: string | null;
}

export type MapAssetLauncher =
  | 'manual'
  | 'prism_launcher_standard'
  | 'prism_launcher_custom'
  | 'prism_launcher_portable'
  | 'official_launcher';

export type MapAssetSourceState = 'valid' | 'version_mismatch' | 'invalid';

export interface MapAssetArtifact {
  path: string;
  identity: string;
}

export interface MapAssetCandidate {
  launcher: MapAssetLauncher;
  launcherRoot: string;
  instanceId: string | null;
  gameDirectory: string | null;
  clientJar: MapAssetArtifact | null;
  resourcePacks: MapAssetArtifact[];
  minecraftVersion: string | null;
  sourceIdentity: string | null;
  resourcePackHash: string | null;
  state: MapAssetSourceState;
  message: string | null;
}

export interface MapRequestContext {
  serverId: string;
  generation: number;
}

export interface MapAssetCandidateSnapshot extends MapRequestContext {
  candidates: MapAssetCandidate[];
}

export function isMapRequestContextCurrent(
  request: MapRequestContext,
  current: MapRequestContext,
): boolean {
  return request.serverId === current.serverId && request.generation === current.generation;
}

export function isMapAssetCandidateCurrent(
  candidate: MapAssetCandidate,
  snapshot: MapAssetCandidateSnapshot,
  current: MapRequestContext,
): boolean {
  return (
    isMapRequestContextCurrent(snapshot, current) &&
    snapshot.candidates.includes(candidate) &&
    getMapAssetCandidateSourcePath(candidate) !== null
  );
}

export function getMapAssetCandidateSourcePath(candidate: MapAssetCandidate): string | null {
  if (candidate.state !== 'valid') {
    return null;
  }
  return candidate.clientJar?.path || candidate.resourcePacks[0]?.path || null;
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
  decodeFailedChunkCount?: number | null;
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

export function isMapAssetSelectionSuccessful(state: MapAssetState): boolean {
  return state !== 'not_applicable' && !isMapAssetWarningState(state);
}

export function mergeMapAssetStatus(
  status: MapStatus | null,
  assetStatus: MapAssetStatus,
): MapStatus | null {
  if (!status) {
    return null;
  }
  return {
    ...status,
    assetState: assetStatus.state,
    assetSource: assetStatus.sourcePath,
    assetIdentity: assetStatus.identity,
    assetMessage: assetStatus.message,
  };
}

export function clearMapAssetStatus(status: MapStatus | null, message: string): MapStatus | null {
  if (!status) {
    return null;
  }
  return {
    ...status,
    assetState: 'invalid',
    assetSource: null,
    assetIdentity: null,
    assetMessage: message,
  };
}

export function isMapTileRequestReady(
  status: MapStatus | null,
  statusError: string | null,
): boolean {
  return (
    !statusError &&
    status !== null &&
    status.configState === 'valid' &&
    (status.component === 'active' || status.component === 'waiting_restart') &&
    status.assetState !== 'not_applicable'
  );
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
    return 'error';
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
  if (visibleStates.some((tile) => (tile.decodeFailedChunkCount ?? 0) > 0)) {
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
