import { type UnlistenFn, tauriInvoke, tauriListen } from '../../lib/tauri-api';
import type {
  MapAssetCandidate,
  MapAssetStatus,
  MapBridgeStatusEvent,
  MapMarker,
  MapMarkerInput,
  MapPlayersUpdatedEvent,
  MapRenderProgressEvent,
  MapRenderRequestResult,
  MapStatus,
  MapTileBytes,
  MapTileInvalidatedEvent,
  MapTileReadyEvent,
  MapViewport,
  MapWorldEntry,
  MapWorldInfo,
} from '../state/map-types';

export function getMapStatus(serverId: string): Promise<MapStatus> {
  return tauriInvoke('get_map_status', { serverId });
}

export function getMapWorldInfo(serverId: string, worldId: string): Promise<MapWorldInfo> {
  return tauriInvoke('get_map_world_info', { serverId, worldId });
}

export function getMapWorlds(serverId: string): Promise<MapWorldEntry[]> {
  return tauriInvoke('get_map_worlds', { serverId });
}

export function getMapMarkers(serverId: string): Promise<MapMarker[]> {
  return tauriInvoke('get_map_markers', { serverId });
}

export function createMapMarker(serverId: string, input: MapMarkerInput): Promise<MapMarker> {
  return tauriInvoke('create_map_marker', { serverId, input });
}

export function updateMapMarker(
  serverId: string,
  markerId: string,
  input: MapMarkerInput,
): Promise<MapMarker> {
  return tauriInvoke('update_map_marker', { serverId, markerId, input });
}

export function deleteMapMarker(serverId: string, markerId: string): Promise<boolean> {
  return tauriInvoke('delete_map_marker', { serverId, markerId });
}

export function requestMapRender(
  serverId: string,
  worldId: string,
  viewport: MapViewport,
): Promise<MapRenderRequestResult> {
  return tauriInvoke('request_map_render', { serverId, worldId, viewport });
}

export function repairMapBridge(serverId: string): Promise<MapStatus> {
  return tauriInvoke('repair_map_bridge', { serverId });
}

export function getMapAssetStatus(serverId: string): Promise<MapAssetStatus> {
  return tauriInvoke('get_map_asset_status', { serverId });
}

export function getMapAssetCandidates(serverId: string): Promise<MapAssetCandidate[]> {
  return tauriInvoke('get_map_asset_candidates', { serverId });
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

export function onMapRenderProgress(
  callback: (event: MapRenderProgressEvent) => void,
): Promise<UnlistenFn> {
  return tauriListen('map-render-progress', callback);
}
