import {
  mapPlaneForZoom,
  mapTileGeometryForZoom,
  worldCoordinatesForMapPlane,
  type MapCoordinateTarget,
} from './map-types';

export interface MapViewportAnchor {
  /** Horizontal fraction relative to the map content, where 0.5 is center. */
  x: number;
  /** Vertical fraction relative to the map content, where 0.5 is center. */
  y: number;
}

export interface MapViewportSize {
  width: number;
  height: number;
}

export interface MapPanOffset {
  x: number;
  y: number;
}

export const MAP_MIN_ZOOM = 0;
export const MAP_MAX_ZOOM = 8;

export function clampMapZoom(zoom: number): number {
  return Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, zoom));
}

export function formatMapZoom(zoom: number): string {
  const clamped = clampMapZoom(zoom);
  return Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(2);
}

export function mapPreviewScale(previewZoom: number, renderedZoom: number): number {
  return 2 ** (clampMapZoom(previewZoom) - clampMapZoom(renderedZoom));
}

function mapPlaneOffsetForViewportAnchor(
  zoom: number,
  anchor: MapViewportAnchor,
  size: MapViewportSize,
) {
  const geometry = mapTileGeometryForZoom(zoom);
  return {
    x: (anchor.x - 0.5) * size.width * geometry.mapUnitsPerPixel,
    z: (anchor.y - 0.5) * size.height * geometry.mapUnitsPerPixel,
  };
}

/** Find the world coordinate currently under an on-screen map anchor. */
export function mapWorldPointAtViewportAnchor(
  center: MapCoordinateTarget,
  zoom: number,
  worldY: number,
  anchor: MapViewportAnchor,
  size: MapViewportSize,
): MapCoordinateTarget {
  const planeCenter = mapPlaneForZoom(center.x, worldY, center.z, zoom);
  const offset = mapPlaneOffsetForViewportAnchor(zoom, anchor, size);
  return worldCoordinatesForMapPlane(
    planeCenter.x + offset.x,
    planeCenter.z + offset.z,
    worldY,
    zoom,
  );
}

/** Center a zoom level so a chosen world coordinate remains below an anchor. */
export function mapWorldCenterForViewportAnchor(
  worldPoint: MapCoordinateTarget,
  zoom: number,
  worldY: number,
  anchor: MapViewportAnchor,
  size: MapViewportSize,
): MapCoordinateTarget {
  const anchorPlane = mapPlaneForZoom(worldPoint.x, worldY, worldPoint.z, zoom);
  const offset = mapPlaneOffsetForViewportAnchor(zoom, anchor, size);
  return worldCoordinatesForMapPlane(
    anchorPlane.x - offset.x,
    anchorPlane.z - offset.z,
    worldY,
    zoom,
  );
}

/** Convert a transient CSS drag offset into the committed world-space center. */
export function commitMapPan(
  center: MapCoordinateTarget,
  zoom: number,
  worldY: number,
  pan: MapPanOffset,
  size: MapViewportSize,
  contentSize: MapViewportSize = size,
): MapCoordinateTarget {
  const geometry = mapTileGeometryForZoom(zoom);
  const planeCenter = mapPlaneForZoom(center.x, worldY, center.z, zoom);
  const unitsPerCssPixelX = (size.width * geometry.mapUnitsPerPixel) / contentSize.width;
  const unitsPerCssPixelZ = (size.height * geometry.mapUnitsPerPixel) / contentSize.height;
  return worldCoordinatesForMapPlane(
    planeCenter.x - pan.x * unitsPerCssPixelX,
    planeCenter.z - pan.y * unitsPerCssPixelZ,
    worldY,
    zoom,
  );
}
