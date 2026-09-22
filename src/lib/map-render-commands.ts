import { tauriInvoke, tauriListen, type UnlistenFn } from './tauri-api';

export type MapProjection = 'world_xz' | 'iso_projected';
export type MapRenderState =
  | 'queued'
  | 'rendering'
  | 'ready'
  | 'empty'
  | 'failed'
  | 'retryable'
  | 'cancelled'
  | 'blocked';
export type MapCacheState = 'miss' | 'hit' | 'stale' | 'failed' | 'corrupt' | 'untrusted';
export type MapRenderSource = 'none' | 'saved' | 'live' | 'saved_and_live';
export type MapUnavailableReason =
  | 'renderer_not_connected'
  | 'bridge_not_connected'
  | 'not_loaded'
  | 'world_unavailable'
  | 'queue_full'
  | 'timeout'
  | 'invalid_snapshot'
  | 'missing_asset'
  | 'malformed_anvil'
  | 'unsupported_version'
  | 'checksum_mismatch'
  | 'cache_corrupt'
  | 'no_generated_terrain';

export interface MapRenderRequest {
  requestId: string;
  serverId: string;
  worldId: string;
  dimension: string;
  minecraftVersion: string;
  projection: MapProjection;
  zoom: number;
  width: number;
  height: number;
  centerX: number;
  centerZ: number;
  worldCenterX: number | null;
  worldCenterZ: number | null;
  tile: { x: number; z: number };
}

export interface MapRenderDiagnostics {
  bridgeState: 'disconnected' | 'connected';
  terrainState: 'unknown' | 'ready' | 'unavailable';
  renderState: MapRenderState;
  source: MapRenderSource;
  liveRequestedCount: number;
  liveReceivedCount: number;
  renderedChunkCount: number;
  decodeFailedChunkCount: number;
  coverageRatio: number;
  unavailableReason: MapUnavailableReason | null;
  rendererVersion: string;
  minecraftVersion: string;
  assetVersion: string | null;
  cacheState: MapCacheState;
  retryable: boolean;
}

export interface MapRenderResponse {
  requestId: string;
  tile: { x: number; z: number };
  zoom: number;
  diagnostics: MapRenderDiagnostics;
}

export interface MapRenderProgressEvent {
  requestId: string;
  serverId: string;
  generation: number;
  diagnostics: MapRenderDiagnostics;
}

export interface MapTileReadyEvent {
  requestId: string;
  serverId: string;
  tile: { x: number; z: number };
  zoom: number;
  png: number[] | null;
  diagnostics: MapRenderDiagnostics;
}

export const MAP_RENDER_PROGRESS_EVENT = 'map-render-progress';
export const MAP_TILE_READY_EVENT = 'map-tile-ready';
export const MAP_BRIDGE_STATE_EVENT = 'map-bridge-state';

export function requestMapRender(request: MapRenderRequest): Promise<MapRenderResponse> {
  return tauriInvoke<MapRenderResponse>('request_map_render', { request });
}

export function listenMapRenderProgress(
  handler: (event: MapRenderProgressEvent) => void,
): Promise<UnlistenFn> {
  return tauriListen(MAP_RENDER_PROGRESS_EVENT, handler);
}

export function listenMapTileReady(
  handler: (event: MapTileReadyEvent) => void,
): Promise<UnlistenFn> {
  return tauriListen(MAP_TILE_READY_EVENT, handler);
}
