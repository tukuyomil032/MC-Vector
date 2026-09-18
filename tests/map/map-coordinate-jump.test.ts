import { describe, expect, it } from 'vitest';
import {
  MAP_COORDINATE_LIMIT,
  parseMapCoordinate,
  parseMapCoordinateTarget,
} from '@/map/state/map-types';

describe('map coordinate jump', () => {
  it('resolves submitted X/Z values into the requested map center', () => {
    expect(parseMapCoordinateTarget(' -123.5 ', '456.25 ')).toEqual({
      x: -123.5,
      z: 456.25,
    });
  });

  it('rejects non-finite, empty, and out-of-range coordinates', () => {
    expect(parseMapCoordinate('')).toBeNull();
    expect(parseMapCoordinate('Infinity')).toBeNull();
    expect(parseMapCoordinate(String(MAP_COORDINATE_LIMIT + 1))).toBeNull();
    expect(parseMapCoordinateTarget('0', String(-MAP_COORDINATE_LIMIT - 1))).toBeNull();
  });
});
