import { describe, expect, it } from 'vitest';

import {
  clampMapZoom,
  commitMapPan,
  mapPreviewScale,
  mapWorldPointAtViewportAnchor,
  mapWorldCenterForViewportAnchor,
} from '@/map/state/map-viewport-interaction';
import {
  mapPlaneForZoom,
  projectWorldToMap,
  unprojectIsoProjectedToWorld,
  unprojectWorldXZToWorld,
  type MapViewport,
} from '@/map/state/map-types';

describe('map viewport interaction', () => {
  it('round-trips both map planes back to world X/Z', () => {
    const world = { x: 137, y: 72, z: -89 };
    const projected = projectWorldToMap(world.x, world.y, world.z);

    expect(unprojectWorldXZToWorld(world.x, world.z)).toEqual({ x: world.x, z: world.z });
    expect(unprojectIsoProjectedToWorld(projected.x, projected.z, world.y)).toEqual({
      x: expect.closeTo(world.x, 9),
      z: expect.closeTo(world.z, 9),
    });
  });

  it('preserves the world coordinate below an anchor across plane and zoom changes', () => {
    const anchor = { x: 0.78, y: 0.31 };
    const size = { width: 768, height: 768 };
    const worldY = 72;
    const oldCenter = { x: 64, z: -48 };
    const anchoredWorld = mapWorldPointAtViewportAnchor(oldCenter, 4, worldY, anchor, size);
    const nextCenter = mapWorldCenterForViewportAnchor(anchoredWorld, 7, worldY, anchor, size);

    expect(mapWorldPointAtViewportAnchor(nextCenter, 7, worldY, anchor, size)).toEqual({
      x: expect.closeTo(anchoredWorld.x, 9),
      z: expect.closeTo(anchoredWorld.z, 9),
    });
  });

  it('clamps backend zoom levels and derives fractional preview scale from the rendered layer', () => {
    expect(clampMapZoom(-2)).toBe(0);
    expect(clampMapZoom(8.8)).toBe(8);
    expect(clampMapZoom(4.25)).toBe(4.25);
    expect(mapPreviewScale(6.5, 5)).toBeCloseTo(2 ** 1.5, 9);
  });

  it('commits a transient drag to world coordinates without retaining CSS pan', () => {
    const center = { x: 256, z: -128 };
    const nextCenter = commitMapPan(center, 4, 64, { x: 48, y: -24 }, { width: 768, height: 768 });

    expect(nextCenter).toEqual({ x: -512, z: 256 });
  });

  it('commits pan through the selected IsoProjected plane', () => {
    const center = { x: 160, z: -96 };
    const before = mapPlaneForZoom(center.x, 64, center.z, 7);
    const afterCenter = commitMapPan(center, 7, 64, { x: 32, y: -16 }, { width: 768, height: 768 });
    const after = mapPlaneForZoom(afterCenter.x, 64, afterCenter.z, 7);

    expect(after).toEqual({
      x: expect.closeTo(before.x - 64, 9),
      z: expect.closeTo(before.z + 32, 9),
    });
  });

  it('requires both renderer-plane and world-space viewport centers', () => {
    const viewport: MapViewport = {
      centerX: 12,
      centerZ: -8,
      worldCenterX: 16,
      worldCenterZ: -4,
      zoom: 6,
    };

    expect(viewport).toMatchObject({ worldCenterX: 16, worldCenterZ: -4 });
  });
});
