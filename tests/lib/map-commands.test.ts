import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}));

describe('map tile binary responses', () => {
  it('normalizes number arrays returned by Tauri into PNG-compatible bytes', async () => {
    const { normalizeMapTileBytes } = await import('@/lib/map-commands');

    expect(normalizeMapTileBytes([137, 80, 78, 71])).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it('preserves ArrayBuffer and Uint8Array responses', async () => {
    const { normalizeMapTileBytes } = await import('@/lib/map-commands');
    const source = new Uint8Array([0, 1, 2, 255]);

    expect(normalizeMapTileBytes(source)).toBe(source);
    expect(normalizeMapTileBytes(source.buffer)).toEqual(source);
  });
});

describe('map tile diagnostics', () => {
  const tile = (overrides: Partial<import('@/lib/map-commands').MapTileReadyEvent> = {}) => ({
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
    const { resolveMapTileDiagnosticState } = await import('@/lib/map-commands');

    expect(
      resolveMapTileDiagnosticState({
        assetState: 'missing',
        isLoading: true,
        requestedTileKeys: ['4:0:0'],
        statusError: 'status unavailable',
        tileError: null,
        tileStates: {},
      }),
    ).toBeNull();
  });

  it('distinguishes a fully empty viewport from a render failure', async () => {
    const { resolveMapTileDiagnosticState } = await import('@/lib/map-commands');

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

  it('reports asset fallback and keeps rendering as separate states', async () => {
    const { resolveMapTileDiagnosticState } = await import('@/lib/map-commands');

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
});
