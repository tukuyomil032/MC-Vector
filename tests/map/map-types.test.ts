import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}));

describe('map tile binary responses', () => {
  it('normalizes number arrays returned by Tauri into PNG-compatible bytes', async () => {
    const { normalizeMapTileBytes } = await import('@/map/state/map-types');

    expect(normalizeMapTileBytes([137, 80, 78, 71])).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it('preserves ArrayBuffer and Uint8Array responses', async () => {
    const { normalizeMapTileBytes } = await import('@/map/state/map-types');
    const source = new Uint8Array([0, 1, 2, 255]);

    expect(normalizeMapTileBytes(source)).toBe(source);
    expect(normalizeMapTileBytes(source.buffer)).toEqual(source);
  });
});

describe('map tile diagnostics', () => {
  const tile = (overrides: Partial<import('@/map/state/map-types').MapTileReadyEvent> = {}) => ({
    serverId: 'server-1',
    worldId: 'overworld',
    zoom: 4,
    tileX: 0,
    tileY: 0,
    hasTerrain: true,
    renderState: 'terrain' as const,
    coverageRatio: 1,
    renderedChunkCount: 1,
    ...overrides,
  });

  it('does not turn a status error into a tile loading state', async () => {
    const { resolveMapTileDiagnosticState } = await import('@/map/state/map-types');

    expect(
      resolveMapTileDiagnosticState({
        assetState: 'missing',
        isLoading: true,
        requestedTileKeys: ['4:0:0'],
        statusError: 'status unavailable',
        tileError: null,
        tileStates: {},
      }),
    ).toBe('error');
  });

  it('distinguishes a fully empty viewport from a render failure', async () => {
    const { resolveMapTileDiagnosticState } = await import('@/map/state/map-types');

    expect(
      resolveMapTileDiagnosticState({
        assetState: 'auto_detected',
        isLoading: false,
        requestedTileKeys: ['4:0:0'],
        statusError: null,
        tileError: null,
        tileStates: {
          '4:0:0': tile({ hasTerrain: false, renderState: 'empty', coverageRatio: 0 }),
        },
      }),
    ).toBe('empty');
    expect(
      resolveMapTileDiagnosticState({
        assetState: 'auto_detected',
        isLoading: false,
        requestedTileKeys: ['4:0:0'],
        statusError: null,
        tileError: 'decoder failed',
        tileStates: {},
      }),
    ).toBe('error');
  });

  it('surfaces chunk decode failures even when the tile contains no terrain', async () => {
    const { resolveMapTileDiagnosticState } = await import('@/map/state/map-types');

    expect(
      resolveMapTileDiagnosticState({
        assetState: 'auto_detected',
        isLoading: false,
        requestedTileKeys: ['4:0:0'],
        statusError: null,
        tileError: null,
        tileStates: {
          '4:0:0': tile({
            hasTerrain: false,
            renderState: 'empty',
            coverageRatio: 0,
            renderedChunkCount: 0,
            decodeFailedChunkCount: 1,
          }),
        },
      }),
    ).toBe('error');
  });

  it('reports asset fallback and keeps rendering as separate states', async () => {
    const { resolveMapTileDiagnosticState } = await import('@/map/state/map-types');

    expect(
      resolveMapTileDiagnosticState({
        assetState: 'fallback',
        isLoading: false,
        requestedTileKeys: ['4:0:0'],
        statusError: null,
        tileError: null,
        tileStates: { '4:0:0': tile() },
      }),
    ).toBe('asset_missing');
    expect(
      resolveMapTileDiagnosticState({
        assetState: 'auto_detected',
        isLoading: true,
        requestedTileKeys: ['4:0:0'],
        statusError: null,
        tileError: null,
        tileStates: {},
      }),
    ).toBe('rendering');
    expect(
      resolveMapTileDiagnosticState({
        assetState: 'auto_detected',
        hasPreviousTiles: true,
        isLoading: true,
        requestedTileKeys: ['4:0:0'],
        statusError: null,
        tileError: null,
        tileStates: {},
      }),
    ).toBe('stale');
  });

  it('keeps warning states separate from detected and user-selected assets', async () => {
    const { isMapAssetSelectionSuccessful, isMapAssetWarningState } =
      await import('@/map/state/map-types');

    expect(isMapAssetWarningState('missing')).toBe(true);
    expect(isMapAssetWarningState('version_mismatch')).toBe(true);
    expect(isMapAssetWarningState('invalid')).toBe(true);
    expect(isMapAssetWarningState('fallback')).toBe(true);
    expect(isMapAssetWarningState('auto_detected')).toBe(false);
    expect(isMapAssetWarningState('user_selected')).toBe(false);
    expect(isMapAssetSelectionSuccessful('auto_detected')).toBe(true);
    expect(isMapAssetSelectionSuccessful('user_selected')).toBe(true);
    expect(isMapAssetSelectionSuccessful('missing')).toBe(false);
    expect(isMapAssetSelectionSuccessful('version_mismatch')).toBe(false);
    expect(isMapAssetSelectionSuccessful('fallback')).toBe(false);
    expect(isMapAssetSelectionSuccessful('invalid')).toBe(false);
  });

  it('clears stale asset success metadata when the refresh fails', async () => {
    const { clearMapAssetStatus, mergeMapAssetStatus } = await import('@/map/state/map-types');
    const status = {
      serverId: 'server-1',
      component: 'active' as const,
      artifact: 'active' as const,
      bridge: 'connected' as const,
      configState: 'valid' as const,
      protocolVersion: 2,
      assetState: 'auto_detected' as const,
      assetSource: '/assets/old.jar',
      assetIdentity: 'sha256:old',
      assetMessage: null,
    };
    const nextAssetStatus = {
      state: 'user_selected' as const,
      sourcePath: '/assets/new.jar',
      identity: 'sha256:new',
      blockstateCount: 1,
      modelCount: 1,
      textureCount: 1,
      animatedTextureCount: 0,
      minecraftVersion: '1.21.1',
      quality: 'full',
      unresolvedBlockstateCount: 0,
      message: null,
    };

    expect(mergeMapAssetStatus(status, nextAssetStatus)).toMatchObject({
      assetState: 'user_selected',
      assetSource: '/assets/new.jar',
    });
    expect(clearMapAssetStatus(status, 'asset status unavailable')).toMatchObject({
      assetState: 'invalid',
      assetSource: null,
      assetIdentity: null,
      assetMessage: 'asset status unavailable',
    });
  });

  it('propagates an asset status error through the existing map diagnostic contract', async () => {
    const { isMapTileRequestReady, resolveMapTileDiagnosticState } =
      await import('@/map/state/map-types');
    const status = {
      serverId: 'server-1',
      component: 'active' as const,
      bridge: 'connected' as const,
      configState: 'valid' as const,
      protocolVersion: 2,
      assetState: 'invalid' as const,
    };

    expect(isMapTileRequestReady(status, 'asset status unavailable')).toBe(false);
    expect(
      resolveMapTileDiagnosticState({
        assetState: 'invalid',
        isLoading: false,
        requestedTileKeys: [],
        statusError: 'asset status unavailable',
        tileError: null,
        tileStates: {},
      }),
    ).toBe('error');
  });
});
