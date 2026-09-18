import { describe, expect, it } from 'vitest';
import { getValidMapWorldBorder } from '@/map/state/map-types';

describe('map world border', () => {
  it('accepts finite positive border dimensions', () => {
    expect(getValidMapWorldBorder({ centerX: 128, centerZ: -64, size: 512 })).toEqual({
      centerX: 128,
      centerZ: -64,
      size: 512,
    });
  });

  it('rejects incomplete, non-finite, and non-positive borders', () => {
    expect(getValidMapWorldBorder(null)).toBeNull();
    expect(getValidMapWorldBorder({ centerX: undefined, centerZ: 0, size: 1 })).toBeNull();
    expect(getValidMapWorldBorder({ centerX: Number.NaN, centerZ: 0, size: 1 })).toBeNull();
    expect(
      getValidMapWorldBorder({ centerX: 0, centerZ: Number.POSITIVE_INFINITY, size: 1 }),
    ).toBeNull();
    expect(getValidMapWorldBorder({ centerX: 0, centerZ: 0, size: 0 })).toBeNull();
    expect(getValidMapWorldBorder({ centerX: 0, centerZ: 0, size: -1 })).toBeNull();
  });
});
