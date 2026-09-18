import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapMarker, MapMarkerInput } from '@/map/state/map-types';
import { isMapMarkerInputValid, mapMarkersForWorld } from '@/map/state/map-types';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: invoke,
}));

const markerInput: MapMarkerInput = {
  worldId: 'overworld',
  group: 'default',
  name: 'Spawn',
  position: { x: 12, y: 64, z: -8 },
  color: '#22c55e',
};

const marker: MapMarker = { id: 'marker-1', ...markerInput };

describe('map markers', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('filters marker overlays by selected world', () => {
    expect(
      mapMarkersForWorld(
        [marker, { ...marker, id: 'marker-2', worldId: 'world_nether' }],
        'overworld',
      ),
    ).toEqual([marker]);
  });

  it('validates marker input before submitting it', () => {
    expect(isMapMarkerInputValid(markerInput)).toBe(true);
    expect(isMapMarkerInputValid({ ...markerInput, name: ' ' })).toBe(false);
    expect(isMapMarkerInputValid({ ...markerInput, color: 'green' })).toBe(false);
    expect(isMapMarkerInputValid({ ...markerInput, position: { x: Number.NaN, y: 0, z: 0 } })).toBe(
      false,
    );
  });

  it('uses the registered marker IPC commands', async () => {
    invoke
      .mockResolvedValueOnce([marker])
      .mockResolvedValueOnce(marker)
      .mockResolvedValueOnce(marker)
      .mockResolvedValueOnce(true);
    const { createMapMarker, deleteMapMarker, getMapMarkers, updateMapMarker } =
      await import('@/map/api/map-commands');

    await expect(getMapMarkers('server-1')).resolves.toEqual([marker]);
    await expect(createMapMarker('server-1', markerInput)).resolves.toEqual(marker);
    await expect(updateMapMarker('server-1', marker.id, markerInput)).resolves.toEqual(marker);
    await expect(deleteMapMarker('server-1', marker.id)).resolves.toBe(true);

    expect(invoke).toHaveBeenNthCalledWith(1, 'get_map_markers', { serverId: 'server-1' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'create_map_marker', {
      serverId: 'server-1',
      input: markerInput,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'update_map_marker', {
      serverId: 'server-1',
      markerId: marker.id,
      input: markerInput,
    });
    expect(invoke).toHaveBeenNthCalledWith(4, 'delete_map_marker', {
      serverId: 'server-1',
      markerId: marker.id,
    });
  });
});
