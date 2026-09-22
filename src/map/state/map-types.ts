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

export type MapCoreArtifactState =
  | 'missing'
  | 'download_required'
  | 'downloading'
  | 'verifying'
  | 'installed'
  | 'outdated'
  | 'invalid'
  | 'conflict'
  | 'error';

export type MapCoreArtifactProvenance = 'development' | 'bundled' | 'github_release';

export type MapCoreArtifactVerification = 'unverified' | 'verifying' | 'verified' | 'failed';

export interface MapCoreArtifactStatus {
  state: MapCoreArtifactState;
  version?: string | null;
  provenance?: MapCoreArtifactProvenance | null;
  releaseTag?: string | null;
  verification: MapCoreArtifactVerification;
  errorReason?: string | null;
}

export interface MapCoreArtifactProgressEvent {
  serverId: string;
  state: MapCoreArtifactState;
  downloadedBytes: number;
  totalBytes: number | null;
}

export type MapTileRenderState =
  | 'terrain'
  | 'empty'
  | 'stale'
  | 'rendering'
  | 'error'
  | 'queue_full'
  | 'asset_missing'
  | 'bridge_incompatible'
  | 'paper_chunk_unavailable';

export type MapTileRenderSource = 'saved' | 'live' | 'savedAndLive';

export interface MapStatus {
  serverId: string;
  component: MapComponentState;
  artifact?: 'active' | 'paused' | null;
  coreArtifact?: MapCoreArtifactStatus;
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

export interface MapWorldEntry {
  worldId: string;
  label: string;
  dimension: string;
  available: boolean;
}

export interface MapAssetStatus {
  state: MapAssetState;
  sourcePath: string | null;
  sourcePaths?: string[];
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
  | 'official_launcher'
  | 'multi_mc'
  | 'modrinth_app'
  | 'curse_forge'
  | 'gd_launcher'
  | 'at_launcher';

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
  return getMapAssetCandidateSourcePaths(candidate)?.[0] ?? null;
}

export function getMapAssetCandidateSourcePaths(candidate: MapAssetCandidate): string[] | null {
  if (candidate.state !== 'valid') {
    return null;
  }
  const paths = [
    ...(candidate.clientJar ? [candidate.clientJar.path] : []),
    ...candidate.resourcePacks.map((resourcePack) => resourcePack.path),
  ];
  return paths.length > 0 ? paths : null;
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

export interface MapMarkerPosition {
  x: number;
  y: number;
  z: number;
}

export interface MapMarker {
  id: string;
  worldId: string;
  group: string;
  name: string;
  position: MapMarkerPosition;
  color: string;
}

export interface MapMarkerInput {
  worldId: string;
  group: string;
  name: string;
  position: MapMarkerPosition;
  color: string;
}

export const MAP_COORDINATE_LIMIT = 30_000_000;

export interface MapCoordinateTarget {
  x: number;
  z: number;
}

export interface MapPlaneCoordinate {
  x: number;
  z: number;
}

export type MapTilePlane = 'WorldXZ' | 'IsoProjected';

/**
 * Canonical geometry shared by viewport requests, tile placement, and event
 * validation. Rust uses the world X/Z plane for overview zooms and the
 * projected Iso plane for detailed zooms.
 */
export interface MapTileGeometry {
  plane: MapTilePlane;
  tileSize: number;
  zoom?: number;
  maxZoom?: number;
  tileX?: number;
  tileY?: number;
  blocksPerPixel: number;
  mapUnitsPerPixel: number;
}

/**
 * Project a world position onto the default Dynmap IsoHDPerspective plane.
 *
 * This is the closed form of the matrix sequence in
 * `src-tauri/src/map/renderer/dynmap/iso_hd.rs` for
 * IsoHDPerspective(135, 60, 1). The second projected axis is named `z` here
 * because the tile/UI contract represents its vertical map-plane coordinate
 * with the same shape as world X/Z.
 */
export function projectWorldToMap(
  worldX: number,
  worldY: number,
  worldZ: number,
): MapPlaneCoordinate {
  return {
    x: (worldX - worldZ) * Math.SQRT1_2,
    z: worldY * 0.5 - (worldX + worldZ) * Math.sqrt(3 / 8),
  };
}

/** Return world X/Z directly from the overview tile plane. */
export function unprojectWorldXZToWorld(mapX: number, mapZ: number): MapCoordinateTarget {
  return { x: mapX, z: mapZ };
}

/**
 * Invert `projectWorldToMap` for the default Dynmap IsoHDPerspective plane.
 * The projection loses Y, so callers supply the stable Y plane they use for
 * viewport interactions (normally the selected world's spawn Y).
 */
export function unprojectIsoProjectedToWorld(
  mapX: number,
  mapZ: number,
  worldY: number,
): MapCoordinateTarget {
  const difference = mapX * Math.SQRT2;
  const sum = (worldY * 0.5 - mapZ) / Math.sqrt(3 / 8);
  return {
    x: (sum + difference) / 2,
    z: (sum - difference) / 2,
  };
}

/**
 * Return the coordinate system used by Rust for a given zoom level.
 * Overview tiles use world X/Z; detailed tiles use the projected Iso plane.
 */
export function mapPlaneForZoom(
  worldX: number,
  worldY: number,
  worldZ: number,
  zoom: number,
): MapPlaneCoordinate {
  return zoom <= 4 ? { x: worldX, z: worldZ } : projectWorldToMap(worldX, worldY, worldZ);
}

/** Invert the plane selected by `mapPlaneForZoom` back to world X/Z. */
export function worldCoordinatesForMapPlane(
  mapX: number,
  mapZ: number,
  worldY: number,
  zoom: number,
): MapCoordinateTarget {
  return zoom <= 4
    ? unprojectWorldXZToWorld(mapX, mapZ)
    : unprojectIsoProjectedToWorld(mapX, mapZ, worldY);
}

export function mapTileGeometryForZoom(zoom: number, tileSize = 256): MapTileGeometry {
  const boundedZoom = Math.min(8, Math.max(0, Math.floor(zoom)));
  const blocksPerPixel = 2 ** (8 - boundedZoom);
  return {
    plane: boundedZoom <= 4 ? 'WorldXZ' : 'IsoProjected',
    tileSize,
    zoom: boundedZoom,
    maxZoom: 8,
    blocksPerPixel,
    mapUnitsPerPixel: blocksPerPixel,
  };
}

export function mapTileEventKey(tile: Pick<MapTileReadyEvent, 'zoom' | 'tileX' | 'tileY'>): string {
  return `${tile.zoom}:${tile.tileX}:${tile.tileY}`;
}

export interface MapTileCoordinate {
  zoom: number;
  tileX: number;
  tileY: number;
  worldId?: string;
}

export function mapTileCoordinateKey(tile: MapTileCoordinate): string {
  return `${tile.zoom}:${tile.tileX}:${tile.tileY}`;
}

export function viewportTileCoordinates(
  center: MapPlaneCoordinate,
  geometry: MapTileGeometry,
  radius = 1,
): MapTileCoordinate[] {
  const tilePlaneSize = geometry.tileSize * geometry.mapUnitsPerPixel;
  const centerTileX = Math.floor(center.x / tilePlaneSize);
  const centerTileY = Math.floor(center.z / tilePlaneSize);
  const coordinates: MapTileCoordinate[] = [];
  for (let tileY = centerTileY - radius; tileY <= centerTileY + radius; tileY += 1) {
    for (let tileX = centerTileX - radius; tileX <= centerTileX + radius; tileX += 1) {
      coordinates.push({
        zoom: geometry.zoom ?? 8 - Math.log2(geometry.blocksPerPixel),
        tileX,
        tileY,
      });
    }
  }
  return coordinates;
}

export function parseMapCoordinate(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const coordinate = Number(trimmed);
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= MAP_COORDINATE_LIMIT
    ? coordinate
    : null;
}

export function parseMapCoordinateTarget(x: string, z: string): MapCoordinateTarget | null {
  const parsedX = parseMapCoordinate(x);
  const parsedZ = parseMapCoordinate(z);
  return parsedX === null || parsedZ === null ? null : { x: parsedX, z: parsedZ };
}

export function mapMarkersForWorld(markers: MapMarker[], worldId: string): MapMarker[] {
  return markers.filter((marker) => marker.worldId === worldId);
}

export function mapMarkerGroupsForWorld(markers: MapMarker[], worldId: string): string[] {
  return [...new Set(mapMarkersForWorld(markers, worldId).map((marker) => marker.group))].sort(
    (left, right) => left.localeCompare(right),
  );
}

export function mapMarkersForWorldAndGroup(
  markers: MapMarker[],
  worldId: string,
  group: string,
): MapMarker[] {
  return mapMarkersForWorld(markers, worldId).filter(
    (marker) => group === 'all' || marker.group === group,
  );
}

export function isMapMarkerInputValid(input: MapMarkerInput): boolean {
  return (
    input.worldId.trim().length > 0 &&
    input.group.trim().length > 0 &&
    input.name.trim().length > 0 &&
    /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(input.color) &&
    Number.isFinite(input.position.x) &&
    Number.isFinite(input.position.y) &&
    Number.isFinite(input.position.z)
  );
}

export interface MapPlayersUpdatedEvent {
  serverId: string;
  message?: {
    players?: MapPlayer[];
  };
}

export interface MapWorldStatus {
  worldId: string;
  dimension: string;
  time: number;
  fullTime: number;
  hasStorm: boolean;
  thundering: boolean;
  weatherDuration: number;
  thunderDuration: number;
  capturedAt: number;
}

export interface MapWorldStatusEvent {
  serverId: string;
  message?: {
    type?: 'world_status';
    worlds?: MapWorldStatus[];
    capturedAt?: number;
  };
}

export interface MapChatMessage {
  type: 'chat_message';
  playerId: string;
  name: string;
  message: string;
  capturedAt: number;
}

export interface MapChatMessageEvent {
  serverId: string;
  message?: MapChatMessage;
}

export function mapWorldStatusForWorld(
  statuses: MapWorldStatus[],
  world: MapWorldEntry | undefined,
  worldId: string,
): MapWorldStatus | null {
  const selectedDimension = world?.dimension?.toLowerCase();
  return (
    statuses.find(
      (status) =>
        status.worldId === worldId ||
        (selectedDimension !== undefined && status.dimension.toLowerCase() === selectedDimension),
    ) ?? null
  );
}

export function formatMinecraftTime(ticks: number): string {
  if (!Number.isFinite(ticks)) {
    return '--:--';
  }
  const normalized = ((Math.floor(ticks) % 24_000) + 24_000) % 24_000;
  const totalMinutes = Math.floor((((normalized + 6_000) % 24_000) / 1_000) * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
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
    worldId?: string;
    dimension?: string;
    chunkX?: number;
    chunkZ?: number;
    tiles?: MapTileCoordinate[];
  };
}

export interface MapTileReadyEvent {
  serverId: string;
  worldId: string;
  zoom: number;
  tileX: number;
  tileY: number;
  requestId?: string | null;
  requestGeneration?: number | null;
  geometry?: Partial<MapTileGeometry> | null;
  hasTerrain: boolean;
  renderState: MapTileRenderState;
  coverageRatio: number;
  renderedChunkCount: number;
  source?: MapTileRenderSource;
  liveRequestedCount?: number;
  liveReceivedCount?: number;
  decodeFailedChunkCount?: number | null;
  message?: string | null;
}

/**
 * A live-only empty tile has no cache entry by design. Its ready event is the
 * complete result, so the renderer must not follow it with a PNG IPC call.
 */
export function isMapTileReadyTerminalWithoutPng(
  event: Partial<
    Pick<MapTileReadyEvent, 'hasTerrain' | 'renderState' | 'source' | 'liveReceivedCount'>
  >,
): boolean {
  return event.renderState === 'empty' && !event.hasTerrain && event.source === 'live';
}

export interface MapRenderProgressEvent {
  serverId: string;
  worldId: string;
  zoom: number;
  tileX: number;
  tileY: number;
  requestId?: string | null;
  requestGeneration?: number | null;
  geometry?: Partial<MapTileGeometry> | null;
  state: MapTileRenderState;
  completed: number;
  total: number;
  message?: string | null;
}

export interface MapRenderRequestContext {
  requestId: string;
  generation: number;
  worldId: string;
  zoom: number;
  viewportTileKeys: ReadonlySet<string>;
  geometry?: MapTileGeometry;
}

export function isMapTileEventCurrent(
  event: Pick<
    MapTileReadyEvent | MapRenderProgressEvent,
    'requestId' | 'requestGeneration' | 'worldId' | 'zoom' | 'tileX' | 'tileY' | 'geometry'
  >,
  request: MapRenderRequestContext,
): boolean {
  if (event.worldId !== request.worldId || event.zoom !== request.zoom) {
    return false;
  }
  if (event.requestId && event.requestId !== request.requestId) {
    return false;
  }
  if (
    event.requestGeneration !== undefined &&
    event.requestGeneration !== null &&
    event.requestGeneration !== request.generation
  ) {
    return false;
  }
  if (event.geometry) {
    if (
      event.geometry.plane &&
      request.geometry?.plane &&
      event.geometry.plane !== request.geometry.plane
    ) {
      return false;
    }
    if (event.geometry.zoom !== undefined && event.geometry.zoom !== request.zoom) {
      return false;
    }
    if (event.geometry.tileX !== undefined && event.geometry.tileX !== event.tileX) {
      return false;
    }
    if (event.geometry.tileY !== undefined && event.geometry.tileY !== event.tileY) {
      return false;
    }
  }
  return request.viewportTileKeys.has(mapTileEventKey(event));
}

export function shouldFetchMapTileAfterReady(
  event: Pick<
    MapTileReadyEvent,
    'requestId' | 'requestGeneration' | 'worldId' | 'zoom' | 'tileX' | 'tileY'
  > &
    Partial<Pick<MapTileReadyEvent, 'hasTerrain' | 'renderState' | 'source' | 'liveReceivedCount'>>,
  request: MapRenderRequestContext,
  pendingInvalidationKeys: ReadonlySet<string> = new Set(),
): boolean {
  if (!isMapTileEventCurrent(event, request)) {
    return false;
  }
  if (isMapTileReadyTerminalWithoutPng(event)) {
    return false;
  }
  const hasPendingInvalidationInViewport = [...pendingInvalidationKeys].some((key) =>
    request.viewportTileKeys.has(key),
  );
  return !hasPendingInvalidationInViewport || pendingInvalidationKeys.has(mapTileEventKey(event));
}

export function shouldReplaceRenderedMapLayer(input: {
  hasPreviousLayer: boolean;
  failed?: boolean;
  requestedTileKeys: ReadonlyArray<string>;
  tileStates: Readonly<Record<string, Pick<MapTileReadyEvent, 'hasTerrain' | 'renderState'>>>;
}): boolean {
  if (input.failed || input.requestedTileKeys.length === 0) {
    return false;
  }
  const targetTiles = input.requestedTileKeys
    .map((key) => input.tileStates[key])
    .filter((tile): tile is Pick<MapTileReadyEvent, 'hasTerrain' | 'renderState'> => Boolean(tile));
  if (targetTiles.length !== input.requestedTileKeys.length) {
    return false;
  }
  const targetIsEmpty = targetTiles.every(
    (tile) => !tile.hasTerrain && tile.renderState === 'empty',
  );
  return !input.hasPreviousLayer || !targetIsEmpty;
}

export function exactMapTileInvalidationKeys(
  event: MapTileInvalidatedEvent,
  worldId: string,
): string[] {
  const message = event.message;
  if (!message?.tiles) {
    return [];
  }
  const messageWorldMatches =
    message.worldId === worldId ||
    (message.worldId === undefined &&
      message.tiles.length > 0 &&
      message.tiles.every((tile) => tile.worldId === worldId));
  if (!messageWorldMatches) {
    return [];
  }
  return [
    ...new Set(
      message.tiles
        .filter((tile) => tile.worldId === undefined || tile.worldId === worldId)
        .map(mapTileCoordinateKey),
    ),
  ];
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
  serverIsOnline = true,
  assetStatusError: string | null = null,
  isLoading = false,
  isActing = false,
): boolean {
  return (
    !statusError &&
    !assetStatusError &&
    serverIsOnline &&
    !isLoading &&
    !isActing &&
    status !== null &&
    status.configState === 'valid' &&
    (status.component === 'active' || status.component === 'waiting_restart') &&
    status.bridge === 'connected' &&
    !isMapAssetWarningState(status.assetState) &&
    status.assetState !== 'not_applicable'
  );
}

export type MapTileDiagnosticState = MapTileRenderState | 'status_error' | null;

export function resolveMapTileDiagnosticState(input: {
  assetState: MapAssetState;
  hasPreviousTiles?: boolean;
  isLoading: boolean;
  requestedTileKeys: string[];
  statusError: string | null;
  assetStatusError?: string | null;
  tileError: string | null;
  renderProgressState?: MapTileRenderState | null;
  tileStates: Record<string, MapTileReadyEvent>;
}): MapTileDiagnosticState {
  if (input.statusError) {
    return 'status_error';
  }
  if (input.assetStatusError) {
    return 'error';
  }
  if (input.renderProgressState === 'queue_full') {
    return 'queue_full';
  }
  const visibleStates = input.requestedTileKeys
    .map((key) => input.tileStates[key])
    .filter((tile): tile is MapTileReadyEvent => Boolean(tile));
  if (input.tileError || visibleStates.some((tile) => tile.renderState === 'error')) {
    return 'error';
  }
  if (visibleStates.some((tile) => tile.renderState === 'queue_full')) {
    return 'queue_full';
  }
  if (visibleStates.some((tile) => (tile.decodeFailedChunkCount ?? 0) > 0)) {
    return 'error';
  }
  if (
    isMapAssetWarningState(input.assetState) ||
    visibleStates.some((tile) => tile.renderState === 'asset_missing')
  ) {
    return 'asset_missing';
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
    return input.hasPreviousTiles ? 'stale' : 'empty';
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

export interface MapWorldBorder {
  centerX?: number | null;
  centerZ?: number | null;
  size?: number | null;
  warningBlocks?: number | null;
  warningTime?: number | null;
}

export interface ValidMapWorldBorder {
  centerX: number;
  centerZ: number;
  size: number;
}

export function getValidMapWorldBorder(
  border: MapWorldBorder | null | undefined,
): ValidMapWorldBorder | null {
  const centerX = border?.centerX;
  const centerZ = border?.centerZ;
  const size = border?.size;
  if (
    typeof centerX !== 'number' ||
    typeof centerZ !== 'number' ||
    typeof size !== 'number' ||
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerZ) ||
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return null;
  }
  return { centerX, centerZ, size };
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
  worldBorder?: MapWorldBorder | null;
}

export interface MapViewport {
  centerX: number;
  centerZ: number;
  /** World-space center retained alongside the renderer's selected plane. */
  worldCenterX: number;
  worldCenterZ: number;
  zoom: number;
  width?: number;
  height?: number;
  requestId?: string;
  requestGeneration?: number;
  geometry?: MapTileGeometry;
}

export interface MapRenderRequestResult {
  requested: number;
  accepted: number;
}
