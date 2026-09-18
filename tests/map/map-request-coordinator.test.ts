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

    expect(request).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    requestGate.resolve('tile');
    await expect(first).resolves.toBe('tile');
    await expect(second).resolves.toBe('tile');
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

  it('can be reused for the same keys after clear', async () => {
    const firstRender = deferred<void>();
    const secondRender = deferred<void>();
    const renderRequest = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => firstRender.promise)
      .mockImplementationOnce(() => secondRender.promise);
    const firstTile = deferred<string>();
    const secondTile = deferred<string>();
    const tileRequest = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => firstTile.promise)
      .mockImplementationOnce(() => secondTile.promise);
    const coordinator = createMapRequestCoordinator();

    const renderBeforeClear = coordinator.requestRender('viewport', renderRequest);
    const tileBeforeClear = coordinator.requestTile('z/x/y', tileRequest);

    coordinator.clear();

    const renderAfterClear = coordinator.requestRender('viewport', renderRequest);
    const tileAfterClear = coordinator.requestTile('z/x/y', tileRequest);

    expect(renderAfterClear).not.toBe(renderBeforeClear);
    expect(tileAfterClear).not.toBe(tileBeforeClear);
    expect(renderRequest).toHaveBeenCalledTimes(2);
    expect(tileRequest).toHaveBeenCalledTimes(2);

    firstRender.resolve(undefined);
    secondRender.resolve(undefined);
    firstTile.resolve('first tile');
    secondTile.resolve('second tile');
    await Promise.all([renderBeforeClear, renderAfterClear, tileBeforeClear, tileAfterClear]);
  });
});
