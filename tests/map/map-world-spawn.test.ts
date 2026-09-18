import { describe, expect, it } from 'vitest';

import { getValidMapWorldSpawn } from '@/map/components/MapView';

describe('map world spawn', () => {
  it('accepts finite spawn coordinates for the selected world', () => {
    expect(
      getValidMapWorldSpawn({ worldId: 'overworld', spawnX: 128, spawnZ: -64 }, 'overworld'),
    ).toEqual({ x: 128, z: -64 });
  });

  it('hides missing, non-finite, and other-world spawn coordinates', () => {
    expect(getValidMapWorldSpawn(null, 'overworld')).toBeNull();
    expect(
      getValidMapWorldSpawn({ worldId: 'overworld', spawnX: null, spawnZ: 0 }, 'overworld'),
    ).toBeNull();
    expect(
      getValidMapWorldSpawn({ worldId: 'overworld', spawnX: Number.NaN, spawnZ: 0 }, 'overworld'),
    ).toBeNull();
    expect(
      getValidMapWorldSpawn(
        { worldId: 'overworld', spawnX: Number.POSITIVE_INFINITY, spawnZ: 0 },
        'overworld',
      ),
    ).toBeNull();
    expect(
      getValidMapWorldSpawn({ worldId: 'world_nether', spawnX: 0, spawnZ: 0 }, 'overworld'),
    ).toBeNull();
  });
});
