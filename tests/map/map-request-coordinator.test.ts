import { describe, expect, it, vi } from 'vitest';

import { createMapRequestCoordinator } from '@/map/state/map-request-coordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('createMapRequestCoordinator', () => {
  it('joins render requests with the same key while the request is in flight', async () => {
    const requestGate = deferred<void>();
    const request = vi.fn(() => requestGate.promise);
    const coordinator = createMapRequestCoordinator();

    const first = coordinator.requestRender('viewport', request);
    const second = coordinator.requestRender('viewport', request);

    expect(request).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    requestGate.resolve(undefined);
    await expect(first).resolves.toBeUndefined();
  });

  it('starts only one in-flight tile request for the same key', async () => {
    const requestGate = deferred<string>();
    const request = vi.fn(() => requestGate.promise);
    const coordinator = createMapRequestCoordinator();

    const first = coordinator.requestTile('z/x/y', request);
    const second = coordinator.requestTile('z/x/y', request);

    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    requestGate.resolve('tile');
    await expect(first).resolves.toBe('tile');
    await expect(second).resolves.toBe('tile');
  });

  it('coalesces a tile when a newer generation requests it before it starts', async () => {
    const firstGate = deferred<void>();
    const sharedRequest = vi.fn(() => Promise.resolve('shared tile'));
    const coordinator = createMapRequestCoordinator({ maxInFlightTiles: 1 });
    const firstGeneration = coordinator.beginTileGeneration();
    const first = coordinator.requestTile('old', () => firstGate.promise, firstGeneration);
    const queued = coordinator.requestTile('shared', sharedRequest, firstGeneration);

    const secondGeneration = coordinator.beginTileGeneration();
    const shared = coordinator.requestTile('shared', sharedRequest, secondGeneration);
    coordinator.cleanupTileGeneration(secondGeneration);

    expect(shared).toBe(queued);
    expect(sharedRequest).not.toHaveBeenCalled();

    firstGate.resolve(undefined);
    await expect(first).resolves.toBeUndefined();
    await expect(shared).resolves.toBe('shared tile');
    expect(sharedRequest).toHaveBeenCalledTimes(1);
  });

  it('removes stale queued tiles and starts the newest generation first', async () => {
    const firstGate = deferred<void>();
    const staleRequest = vi.fn(() => Promise.resolve('stale tile'));
    const newestRequest = vi.fn(() => Promise.resolve('new tile'));
    const coordinator = createMapRequestCoordinator({ maxInFlightTiles: 1 });
    const firstGeneration = coordinator.beginTileGeneration();
    const first = coordinator.requestTile('first', () => firstGate.promise, firstGeneration);
    const stale = coordinator.requestTile('stale', staleRequest, firstGeneration);

    const secondGeneration = coordinator.beginTileGeneration();
    const newest = coordinator.requestTile('newest', newestRequest, secondGeneration);
    coordinator.cleanupTileGeneration(secondGeneration);

    await expect(stale).rejects.toThrow('superseded by a newer viewport');
    expect(staleRequest).not.toHaveBeenCalled();

    firstGate.resolve(undefined);
    await expect(first).resolves.toBeUndefined();
    await expect(newest).resolves.toBe('new tile');
    expect(newestRequest).toHaveBeenCalledTimes(1);
  });

  it('allows a failed render and tile request to be retried', async () => {
    const renderRequest = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('render failed'))
      .mockResolvedValueOnce(undefined);
    const tileRequest = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('tile failed'))
      .mockResolvedValueOnce('tile');
    const coordinator = createMapRequestCoordinator();

    await expect(coordinator.requestRender('viewport', renderRequest)).rejects.toThrow(
      'render failed',
    );
    await expect(coordinator.requestRender('viewport', renderRequest)).resolves.toBeUndefined();

    await expect(coordinator.requestTile('z/x/y', tileRequest)).rejects.toThrow('tile failed');
    await expect(coordinator.requestTile('z/x/y', tileRequest)).resolves.toBe('tile');

    expect(renderRequest).toHaveBeenCalledTimes(2);
    expect(tileRequest).toHaveBeenCalledTimes(2);
  });

  it('keeps an active tile request coalesced while clearing queued work', async () => {
    const firstRender = deferred<void>();
    const secondRender = deferred<void>();
    const renderRequest = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => firstRender.promise)
      .mockImplementationOnce(() => secondRender.promise);
    const firstTile = deferred<string>();
    const tileRequest = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => firstTile.promise);
    const coordinator = createMapRequestCoordinator({ maxInFlightTiles: 1 });

    const renderBeforeClear = coordinator.requestRender('viewport', renderRequest);
    const tileBeforeClear = coordinator.requestTile('z/x/y', tileRequest);
    const queuedTile = coordinator.requestTile('queued', tileRequest);

    coordinator.clear();

    const renderAfterClear = coordinator.requestRender('viewport', renderRequest);
    const tileAfterClear = coordinator.requestTile('z/x/y', tileRequest);

    expect(renderAfterClear).not.toBe(renderBeforeClear);
    expect(tileAfterClear).toBe(tileBeforeClear);
    expect(renderRequest).toHaveBeenCalledTimes(2);
    await expect(queuedTile).rejects.toThrow('superseded by a newer viewport');
    expect(tileRequest).toHaveBeenCalledTimes(1);

    firstRender.resolve(undefined);
    secondRender.resolve(undefined);
    firstTile.resolve('first tile');
    await Promise.all([renderBeforeClear, renderAfterClear, tileBeforeClear, tileAfterClear]);
  });
});
