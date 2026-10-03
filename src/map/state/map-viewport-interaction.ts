import type { MapProjection } from '../../lib/map-render-commands';

export const MIN_MAP_ZOOM = 0;
export const MAX_MAP_ZOOM = 8;

const SQRT_HALF = Math.sqrt(1 / 2);
const SQRT_THREE_EIGHTHS = Math.sqrt(3 / 8);

export interface WorldPoint {
  worldX: number;
  worldZ: number;
}

export interface MapPoint {
  mapX: number;
  mapZ: number;
}

export interface ScreenPoint {
  screenX: number;
  screenY: number;
}

export interface PreviewAnchor extends ScreenPoint, WorldPoint {}

export interface MapViewportInteractionState {
  renderedZoom: number;
  previewZoom: number;
  targetZoom: number;
  previewScale: number;
  previewAnchor: PreviewAnchor | null;
}

export interface ViewportMetrics {
  width: number;
  height: number;
}

export interface ZoomUpdateInput {
  state: MapViewportInteractionState;
  deltaZoom: number;
  cursor: ScreenPoint;
  viewport: ViewportMetrics;
  mapCenter: WorldPoint;
  projection: MapProjection;
  worldY?: number;
}

export interface ZoomUpdate {
  state: MapViewportInteractionState;
  mapCenter: WorldPoint;
}

export function clampMapZoom(zoom: number): number {
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, zoom));
}

export function zoomScale(zoom: number): number {
  return 2 ** zoom;
}

export function previewScale(renderedZoom: number, previewZoom: number): number {
  return 2 ** (previewZoom - renderedZoom);
}

export function createMapViewportInteraction(
  initialZoom = MAX_MAP_ZOOM,
): MapViewportInteractionState {
  const zoom = clampMapZoom(initialZoom);
  return {
    renderedZoom: zoom,
    previewZoom: zoom,
    targetZoom: zoom,
    previewScale: 1,
    previewAnchor: null,
  };
}

/** Project a Minecraft world position using the same map-space contract as the renderer. */
export function projectWorldToMap(
  point: WorldPoint,
  projection: MapProjection,
  worldY = 0,
): MapPoint {
  if (projection === 'world_xz') {
    return { mapX: point.worldX, mapZ: point.worldZ };
  }

  return {
    mapX: (point.worldX - point.worldZ) * SQRT_HALF,
    mapZ: worldY * 0.5 - (point.worldX + point.worldZ) * SQRT_THREE_EIGHTHS,
  };
}

/** Inverse of `projectWorldToMap` with a fixed isometric world height. */
export function unprojectMapToWorld(
  point: MapPoint,
  projection: MapProjection,
  worldY = 0,
): WorldPoint {
  if (projection === 'world_xz') {
    return { worldX: point.mapX, worldZ: point.mapZ };
  }

  const sum = (worldY * 0.5 - point.mapZ) / SQRT_THREE_EIGHTHS;
  const diff = point.mapX / SQRT_HALF;
  return {
    worldX: (sum + diff) / 2,
    worldZ: (sum - diff) / 2,
  };
}

function mapPointAtScreen(
  screen: ScreenPoint,
  viewport: ViewportMetrics,
  mapCenter: MapPoint,
  scale: number,
): MapPoint {
  return {
    mapX: mapCenter.mapX + (screen.screenX - viewport.width / 2) / scale,
    mapZ: mapCenter.mapZ + (screen.screenY - viewport.height / 2) / scale,
  };
}

/**
 * Update continuous preview zoom while keeping the cursor's world point fixed.
 * The backend target remains an integer; the returned scale is only for the current layer.
 */
export function updateZoomAtCursor(input: ZoomUpdateInput): ZoomUpdate {
  const nextPreviewZoom = clampMapZoom(input.state.previewZoom + input.deltaZoom);
  const worldY = input.worldY ?? 0;
  const currentScale = zoomScale(input.state.previewZoom);
  const nextScale = zoomScale(nextPreviewZoom);
  const currentMapCenter = projectWorldToMap(input.mapCenter, input.projection, worldY);
  const anchorMapPoint = mapPointAtScreen(
    input.cursor,
    input.viewport,
    currentMapCenter,
    currentScale,
  );
  const nextMapCenter: MapPoint = {
    mapX: anchorMapPoint.mapX - (input.cursor.screenX - input.viewport.width / 2) / nextScale,
    mapZ: anchorMapPoint.mapZ - (input.cursor.screenY - input.viewport.height / 2) / nextScale,
  };

  return {
    state: {
      ...input.state,
      previewZoom: nextPreviewZoom,
      targetZoom: Math.round(nextPreviewZoom),
      previewScale: previewScale(input.state.renderedZoom, nextPreviewZoom),
      previewAnchor: {
        ...input.cursor,
        ...unprojectMapToWorld(anchorMapPoint, input.projection, worldY),
      },
    },
    mapCenter: unprojectMapToWorld(nextMapCenter, input.projection, worldY),
  };
}

export function commitRenderedZoom(
  state: MapViewportInteractionState,
  renderedZoom: number,
  tileReady: boolean,
): MapViewportInteractionState {
  if (!tileReady) {
    return state;
  }

  const zoom = clampMapZoom(renderedZoom);
  return {
    renderedZoom: zoom,
    previewZoom: zoom,
    targetZoom: zoom,
    previewScale: 1,
    previewAnchor: null,
  };
}

/** Commit a pointer drag as a world-coordinate center after pointer capture ends. */
export function commitPan(
  mapCenter: WorldPoint,
  screenDelta: ScreenPoint,
  zoom: number,
  projection: MapProjection,
  worldY = 0,
): WorldPoint {
  const scale = zoomScale(clampMapZoom(zoom));
  const currentMapCenter = projectWorldToMap(mapCenter, projection, worldY);
  return unprojectMapToWorld(
    {
      mapX: currentMapCenter.mapX - screenDelta.screenX / scale,
      mapZ: currentMapCenter.mapZ - screenDelta.screenY / scale,
    },
    projection,
    worldY,
  );
}
