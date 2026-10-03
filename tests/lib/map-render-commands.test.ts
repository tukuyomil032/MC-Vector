import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();
const tauriListenMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: tauriListenMock,
}));

describe('map-render-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
    tauriListenMock.mockReset();
  });

  it('sends the camelCase render request through the allowlisted command', async () => {
    const response = {
      requestId: 'request-1',
      tile: { x: 0, z: 0 },
      zoom: 8,
      diagnostics: {
        bridgeState: 'disconnected',
        terrainState: 'unknown',
        renderState: 'blocked',
        source: 'none',
        liveRequestedCount: 0,
        liveReceivedCount: 0,
        renderedChunkCount: 0,
        decodeFailedChunkCount: 0,
        coverageRatio: 0,
        unavailableReason: 'renderer_not_connected',
        rendererVersion: 'dynmap-test',
        minecraftVersion: '1.21.4',
        assetVersion: null,
        cacheState: 'miss',
        retryable: true,
      },
    };
    tauriInvokeMock.mockResolvedValueOnce(response);
    const { requestMapRender } = await import('@/lib/map-render-commands');
    const request = {
      requestId: 'request-1',
      serverId: 'server-1',
      worldId: 'world-1',
      dimension: 'minecraft:overworld',
      minecraftVersion: '1.21.4',
      projection: 'iso_projected' as const,
      zoom: 8,
      width: 768,
      height: 768,
      centerX: 0,
      centerZ: 0,
      worldCenterX: 0,
      worldCenterZ: 0,
      tile: { x: 0, z: 0 },
    };

    await expect(requestMapRender(request)).resolves.toEqual(response);
    expect(tauriInvokeMock).toHaveBeenCalledWith('request_map_render', { request });
  });

  it('registers progress and tile listeners with cleanup handles', async () => {
    const unlistenProgress = vi.fn();
    const unlistenTile = vi.fn();
    tauriListenMock.mockResolvedValueOnce(unlistenProgress).mockResolvedValueOnce(unlistenTile);
    const {
      listenMapRenderProgress,
      listenMapTileReady,
      MAP_RENDER_PROGRESS_EVENT,
      MAP_TILE_READY_EVENT,
    } = await import('@/lib/map-render-commands');
    const progressHandler = vi.fn();
    const tileHandler = vi.fn();

    await expect(listenMapRenderProgress(progressHandler)).resolves.toBe(unlistenProgress);
    await expect(listenMapTileReady(tileHandler)).resolves.toBe(unlistenTile);
    expect(tauriListenMock).toHaveBeenNthCalledWith(1, MAP_RENDER_PROGRESS_EVENT, progressHandler);
    expect(tauriListenMock).toHaveBeenNthCalledWith(2, MAP_TILE_READY_EVENT, tileHandler);
  });
});
