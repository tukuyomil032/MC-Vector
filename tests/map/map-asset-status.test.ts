import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapAssetStatus } from '@/map/state/map-types';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: invoke,
}));

const fullAssetStatus: MapAssetStatus = {
  state: 'user_selected' as const,
  sourcePath: '/assets/minecraft-1.21.1.jar',
  identity: 'sha256:asset',
  blockstateCount: 42,
  modelCount: 84,
  textureCount: 126,
  animatedTextureCount: 3,
  minecraftVersion: '1.21.1',
  quality: 'full',
  unresolvedBlockstateCount: 0,
  message: null,
};

describe('map asset status bridge', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('loads and preserves the backend full asset status schema', async () => {
    invoke.mockResolvedValueOnce(fullAssetStatus);
    const { getMapAssetStatus } = await import('@/map/api/map-commands');

    await expect(getMapAssetStatus('server-1')).resolves.toEqual(fullAssetStatus);
    expect(invoke).toHaveBeenCalledWith('get_map_asset_status', { serverId: 'server-1' });
  });

  it('uses the selection response with the same full schema', async () => {
    invoke.mockResolvedValueOnce({ ...fullAssetStatus, state: 'auto_detected' });
    const { selectMapAsset } = await import('@/map/api/map-commands');

    await expect(selectMapAsset('server-1', '/assets/selected.zip')).resolves.toMatchObject({
      animatedTextureCount: 3,
      minecraftVersion: '1.21.1',
      quality: 'full',
      unresolvedBlockstateCount: 0,
    });
    expect(invoke).toHaveBeenCalledWith('select_map_asset', {
      serverId: 'server-1',
      sourcePath: '/assets/selected.zip',
    });
  });
});
