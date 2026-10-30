import { describe, expect, it } from 'vitest';
import { canStartServer } from '@/renderer/shared/server-status';
import type { ServerStatus } from '@/renderer/shared/server declaration';

describe('canStartServer', () => {
  it.each<[ServerStatus, boolean]>([
    ['offline', true],
    ['crashed', true],
    ['online', false],
    ['starting', false],
    ['stopping', false],
    ['restarting', false],
  ])('returns %s -> %s', (status, expected) => {
    expect(canStartServer(status)).toBe(expected);
  });

  it('returns false when no server is selected', () => {
    expect(canStartServer(undefined)).toBe(false);
  });
});
