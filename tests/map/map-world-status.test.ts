import { describe, expect, it } from 'vitest';
import {
  formatMinecraftTime,
  mapWorldStatusForWorld,
  type MapWorldEntry,
  type MapWorldStatus,
} from '@/map/state/map-types';

const overworld: MapWorldEntry = {
  worldId: 'overworld',
  label: 'Overworld',
  dimension: 'minecraft:overworld',
  available: true,
};

const status: MapWorldStatus = {
  worldId: 'world',
  dimension: 'minecraft:overworld',
  time: 6_000,
  fullTime: 12_000,
  hasStorm: false,
  thundering: false,
  weatherDuration: 0,
  thunderDuration: 0,
  capturedAt: 1,
};

describe('map world status', () => {
  it('matches the selected standard world by dimension', () => {
    expect(mapWorldStatusForWorld([status], overworld, 'overworld')).toEqual(status);
  });

  it('converts Minecraft ticks into a readable clock', () => {
    expect(formatMinecraftTime(6_000)).toBe('12:00');
    expect(formatMinecraftTime(18_000)).toBe('00:00');
    expect(formatMinecraftTime(Number.NaN)).toBe('--:--');
  });
});
