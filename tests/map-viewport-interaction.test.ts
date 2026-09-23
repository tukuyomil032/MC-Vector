import {
  commitPan,
  commitRenderedZoom,
  createMapViewportInteraction,
  previewScale,
  projectWorldToMap,
  unprojectMapToWorld,
  updateZoomAtCursor,
} from '@/map/state/map-viewport-interaction';
import { describe, expect, it } from 'vitest';

function expectPointClose(actual: { worldX: number; worldZ: number }, expected: typeof actual) {
  expect(actual.worldX).toBeCloseTo(expected.worldX, 8);
  expect(actual.worldZ).toBeCloseTo(expected.worldZ, 8);
}

describe('map viewport interaction', () => {
  it.each(['world_xz', 'iso_projected'] as const)('%s projection round trips', (projection) => {
    const point = { worldX: 123.5, worldZ: -88.25 };
    const mapPoint = projectWorldToMap(point, projection, 64);
    expectPointClose(unprojectMapToWorld(mapPoint, projection, 64), point);
  });

  it('keeps a cursor anchor fixed while zooming continuously', () => {
    const state = createMapViewportInteraction(8);
    const cursor = { screenX: 96, screenY: 544 };
    const result = updateZoomAtCursor({
      state,
      deltaZoom: -1.25,
      cursor,
      viewport: { width: 768, height: 768 },
      mapCenter: { worldX: 120, worldZ: -40 },
      projection: 'iso_projected',
      worldY: 64,
    });

    expect(result.state.previewZoom).toBe(6.75);
    expect(result.state.targetZoom).toBe(7);
    expect(result.state.previewScale).toBeCloseTo(previewScale(8, 6.75));
    expectPointClose(
      result.state.previewAnchor ?? { worldX: 0, worldZ: 0 },
      projectCursorWorld(
        state,
        cursor,
        { width: 768, height: 768 },
        { worldX: 120, worldZ: -40 },
        'iso_projected',
        64,
      ),
    );
  });

  it('clamps preview and target zoom at both bounds', () => {
    const state = createMapViewportInteraction(0);
    const low = updateZoomAtCursor({
      state,
      deltaZoom: -0.5,
      cursor: { screenX: 384, screenY: 384 },
      viewport: { width: 768, height: 768 },
      mapCenter: { worldX: 0, worldZ: 0 },
      projection: 'world_xz',
    });
    expect(low.state.previewZoom).toBe(0);
    expect(low.state.targetZoom).toBe(0);

    const high = updateZoomAtCursor({
      state: createMapViewportInteraction(8),
      deltaZoom: 0.5,
      cursor: { screenX: 384, screenY: 384 },
      viewport: { width: 768, height: 768 },
      mapCenter: { worldX: 0, worldZ: 0 },
      projection: 'world_xz',
    });
    expect(high.state.previewZoom).toBe(8);
    expect(high.state.targetZoom).toBe(8);
  });

  it('retains the old layer until the target tile is ready', () => {
    const state = createMapViewportInteraction(8);
    const preview = updateZoomAtCursor({
      state,
      deltaZoom: -1,
      cursor: { screenX: 384, screenY: 384 },
      viewport: { width: 768, height: 768 },
      mapCenter: { worldX: 0, worldZ: 0 },
      projection: 'world_xz',
    });

    expect(commitRenderedZoom(preview.state, 7, false)).toEqual(preview.state);
    expect(commitRenderedZoom(preview.state, 7, true)).toMatchObject({
      renderedZoom: 7,
      previewZoom: 7,
      previewScale: 1,
      previewAnchor: null,
    });
  });

  it('commits a drag to the map center on pointerup', () => {
    const center = commitPan(
      { worldX: 100, worldZ: -25 },
      { screenX: 128, screenY: -64 },
      8,
      'world_xz',
    );
    expectPointClose(center, { worldX: 99.5, worldZ: -24.75 });
  });
});

function projectCursorWorld(
  state: ReturnType<typeof createMapViewportInteraction>,
  cursor: { screenX: number; screenY: number },
  viewport: { width: number; height: number },
  mapCenter: { worldX: number; worldZ: number },
  projection: 'world_xz' | 'iso_projected',
  worldY: number,
) {
  const scale = 2 ** state.previewZoom;
  const center = projectWorldToMap(mapCenter, projection, worldY);
  return unprojectMapToWorld(
    {
      mapX: center.mapX + (cursor.screenX - viewport.width / 2) / scale,
      mapZ: center.mapZ + (cursor.screenY - viewport.height / 2) / scale,
    },
    projection,
    worldY,
  );
}
