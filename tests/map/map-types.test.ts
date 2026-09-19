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

describe('map plane coordinates', () => {
  it('uses world X/Z for overview zooms', async () => {
    const { mapPlaneForZoom } = await import('@/map/state/map-types');

    expect(mapPlaneForZoom(-17, 72, 31, 4)).toEqual({ x: -17, z: 31 });
  });

  it('uses the default Dynmap Iso projection for detailed zooms', async () => {
    const { mapPlaneForZoom, projectWorldToMap } = await import('@/map/state/map-types');
    const projected = projectWorldToMap(16, 64, 0);

    expect(projected.x).toBeCloseTo(16 * Math.SQRT1_2, 9);
    expect(projected.z).toBeCloseTo(32 - 16 * Math.sqrt(3 / 8), 9);
    expect(mapPlaneForZoom(16, 64, 0, 5)).toEqual(projected);
  });

  it('keeps negative projected coordinates finite for floor-based tile selection', async () => {
    const { projectWorldToMap } = await import('@/map/state/map-types');
    const projected = projectWorldToMap(-17, 64, 31);

    expect(Number.isFinite(projected.x)).toBe(true);
    expect(Number.isFinite(projected.z)).toBe(true);
    expect(Math.floor(projected.x / 256)).toBe(-1);
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

  it('keeps a status error distinct from tile rendering errors', async () => {
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
    ).toBe('status_error');
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

  it('keeps tile errors ahead of asset warnings', async () => {
    const { resolveMapTileDiagnosticState } = await import('@/map/state/map-types');

    expect(
      resolveMapTileDiagnosticState({
        assetState: 'missing',
        isLoading: false,
        requestedTileKeys: ['4:0:0'],
        statusError: null,
        tileError: 'tile request failed',
        tileStates: {},
      }),
    ).toBe('error');
    expect(
      resolveMapTileDiagnosticState({
        assetState: 'missing',
        isLoading: false,
        requestedTileKeys: ['4:0:0'],
        statusError: null,
        tileError: null,
        tileStates: {
          '4:0:0': tile({ renderState: 'error', message: 'tile render failed' }),
        },
      }),
    ).toBe('error');
  });

  it('keeps asset warnings ahead of empty and rendering states', async () => {
    const { resolveMapTileDiagnosticState } = await import('@/map/state/map-types');

    expect(
      resolveMapTileDiagnosticState({
        assetState: 'version_mismatch',
        isLoading: false,
        requestedTileKeys: ['4:0:0'],
        statusError: null,
        tileError: null,
        tileStates: {
          '4:0:0': tile({ hasTerrain: false, renderState: 'empty' }),
        },
      }),
    ).toBe('asset_missing');
    expect(
      resolveMapTileDiagnosticState({
        assetState: 'version_mismatch',
        isLoading: true,
        requestedTileKeys: ['4:0:0'],
        statusError: null,
        tileError: null,
        tileStates: {},
      }),
    ).toBe('asset_missing');
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
        statusError: null,
        assetStatusError: 'asset status unavailable',
        tileError: null,
        tileStates: {},
      }),
    ).toBe('error');
  });

  it('does not request tiles while the bridge or server is unavailable', async () => {
    const { isMapTileRequestReady } = await import('@/map/state/map-types');
    const status = {
      serverId: 'server-1',
      component: 'active' as const,
      bridge: 'connected' as const,
      configState: 'valid' as const,
      protocolVersion: 2,
      assetState: 'auto_detected' as const,
    };

    expect(isMapTileRequestReady(status, null, true)).toBe(true);
    expect(isMapTileRequestReady({ ...status, bridge: 'disconnected' }, null, true)).toBe(false);
    expect(isMapTileRequestReady(status, null, false)).toBe(false);
  });
});

describe('map asset candidates', () => {
  const candidate = (
    overrides: Partial<import('@/map/state/map-types').MapAssetCandidate> = {},
  ) => ({
    launcher: 'prism_launcher_standard' as const,
    launcherRoot: '/launchers/prism',
    instanceId: 'instance-1',
    gameDirectory: '/instances/instance-1/.minecraft',
    clientJar: {
      path: '/instances/instance-1/.minecraft/versions/1.21.1/client.jar',
      identity: 'sha256:jar',
    },
    resourcePacks: [
      {
        path: '/instances/instance-1/.minecraft/resourcepacks/example.zip',
        identity: 'sha256:pack',
      },
    ],
    minecraftVersion: '1.21.1',
    sourceIdentity: 'prism:instance-1',
    resourcePackHash: 'sha256:pack',
    state: 'valid' as const,
    message: null,
    ...overrides,
  });

  it('prefers the validated client jar path for a selectable candidate', async () => {
    const { getMapAssetCandidateSourcePath } = await import('@/map/state/map-types');

    expect(getMapAssetCandidateSourcePath(candidate())).toBe(
      '/instances/instance-1/.minecraft/versions/1.21.1/client.jar',
    );
  });

  it('falls back to the first resource pack when the client jar is absent', async () => {
    const { getMapAssetCandidateSourcePath } = await import('@/map/state/map-types');

    expect(getMapAssetCandidateSourcePath(candidate({ clientJar: null }))).toBe(
      '/instances/instance-1/.minecraft/resourcepacks/example.zip',
    );
  });

  it('does not expose warning candidates as selectable paths', async () => {
    const { getMapAssetCandidateSourcePath } = await import('@/map/state/map-types');

    expect(
      getMapAssetCandidateSourcePath(
        candidate({ state: 'version_mismatch', message: 'wrong version' }),
      ),
    ).toBeNull();
    expect(
      getMapAssetCandidateSourcePath(candidate({ state: 'invalid', message: 'missing jar' })),
    ).toBeNull();
  });

  it('rejects candidates from a previous server request generation', async () => {
    const { isMapAssetCandidateCurrent } = await import('@/map/state/map-types');
    const selected = candidate();
    const current = { serverId: 'server-1', generation: 2 };
    const snapshot = {
      serverId: 'server-1',
      generation: 2,
      candidates: [selected],
    };

    expect(isMapAssetCandidateCurrent(selected, snapshot, current)).toBe(true);
    expect(isMapAssetCandidateCurrent(selected, { ...snapshot, generation: 1 }, current)).toBe(
      false,
    );
    expect(
      isMapAssetCandidateCurrent(selected, { ...snapshot, serverId: 'server-2' }, current),
    ).toBe(false);
  });
});
