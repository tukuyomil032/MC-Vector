import { describe, expect, it } from 'vitest';
import { interpolateMapPlayers } from '@/map/hooks/use-map-player-interpolation';
import type { MapPlayer } from '@/map/state/map-types';

function player(overrides: Partial<MapPlayer> = {}): MapPlayer {
  return {
    playerId: 'player-1',
    name: 'Alex',
    dimension: 'minecraft:overworld',
    x: 0,
    y: 64,
    z: 0,
    yaw: 0,
    pitch: 0,
    capturedAt: 1,
    ...overrides,
  };
}

describe('map player interpolation', () => {
  it('interpolates coordinates while preserving the newest snapshot metadata', () => {
    const previous = [player({ x: 0, y: 64, z: 0, name: 'Old', capturedAt: 1 })];
    const target = [player({ x: 10, y: 70, z: -10, name: 'New', capturedAt: 2 })];

    expect(interpolateMapPlayers(previous, target, 0.5)).toEqual([
      player({ x: 5, y: 67, z: -5, name: 'New', capturedAt: 2 }),
    ]);
  });

  it('does not retain players removed from the latest snapshot', () => {
    expect(
      interpolateMapPlayers(
        [player(), player({ playerId: 'player-2', name: 'Removed', x: 8 })],
        [player({ x: 4 })],
        0.5,
      ),
    ).toHaveLength(1);
  });

  it('snaps new players and dimension changes to their target position', () => {
    const target = [
      player({ playerId: 'new', x: 12, z: 4 }),
      player({ playerId: 'player-2', dimension: 'minecraft:the_nether', x: 20, z: 8 }),
    ];

    expect(
      interpolateMapPlayers([player({ x: 0 }), player({ playerId: 'player-2', x: 1 })], target, 0),
    ).toEqual(target);
  });
});
