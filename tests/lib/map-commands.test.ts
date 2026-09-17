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
