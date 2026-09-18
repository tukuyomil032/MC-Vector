import { useEffect, useRef, useState } from 'react';
import type { MapPlayer } from '../state/map-types';

export const MAP_PLAYER_INTERPOLATION_DURATION_MS = 180;

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

export function interpolateMapPlayers(
  previous: MapPlayer[],
  target: MapPlayer[],
  progress: number,
): MapPlayer[] {
  const amount = clampProgress(progress);
  const previousById = new Map(previous.map((player) => [player.playerId, player]));

  return target.map((player) => {
    const from = previousById.get(player.playerId);
    if (!from || from.dimension !== player.dimension) {
      return player;
    }
    return {
      ...player,
      x: from.x + (player.x - from.x) * amount,
      y: from.y + (player.y - from.y) * amount,
      z: from.z + (player.z - from.z) * amount,
    };
  });
}

function cancelAnimationFrameIfNeeded(frame: number | null): void {
  if (frame !== null) {
    window.cancelAnimationFrame(frame);
  }
}

export function useMapPlayerInterpolation(
  players: MapPlayer[],
  worldKey: string,
  enabled: boolean,
): MapPlayer[] {
  const positionsRef = useRef<MapPlayer[]>(players);
  const worldKeyRef = useRef(worldKey);
  const animationFrameRef = useRef<number | null>(null);
  const [, forceRender] = useState(0);

  if (worldKeyRef.current !== worldKey) {
    worldKeyRef.current = worldKey;
    positionsRef.current = players;
  }

  useEffect(() => {
    cancelAnimationFrameIfNeeded(animationFrameRef.current);
    animationFrameRef.current = null;

    if (!enabled || players.length === 0) {
      positionsRef.current = enabled ? players : [];
      forceRender((value) => value + 1);
      return;
    }

    const previous = positionsRef.current;
    const startedAt = performance.now();
    const animate = (timestamp: number) => {
      const progress = clampProgress(
        (timestamp - startedAt) / MAP_PLAYER_INTERPOLATION_DURATION_MS,
      );
      positionsRef.current = interpolateMapPlayers(previous, players, progress);
      forceRender((value) => value + 1);
      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrameIfNeeded(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, [enabled, players, worldKey]);

  if (!enabled) {
    return [];
  }

  const currentById = new Map(positionsRef.current.map((player) => [player.playerId, player]));
  return players.map((player) => {
    const current = currentById.get(player.playerId);
    return current && current.dimension === player.dimension
      ? { ...player, x: current.x, y: current.y, z: current.z }
      : player;
  });
}
