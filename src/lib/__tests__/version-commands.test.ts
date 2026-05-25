import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: fetchMock }));

function makeResponse(data: unknown) {
  return { json: vi.fn().mockResolvedValue(data) };
}

describe('resolveLatestJarUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
  });

  describe('Paper', () => {
    it('returns latestVersion and downloadUrl from PaperMC API', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse({ versions: ['1.20', '1.21'] }))
        .mockResolvedValueOnce(
          makeResponse({
            builds: [{ build: 100, downloads: { application: { name: 'paper-1.21-100.jar' } } }],
          }),
        );
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Paper', '1.21');
      expect(result?.latestVersion).toBe('1.21');
      expect(result?.downloadUrl).toContain('paper-1.21-100.jar');
      expect(result?.downloadUrl).toContain('api.papermc.io');
    });

    it('uses filename from builds.downloads.application.name when available', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ versions: ['1.21'] })).mockResolvedValueOnce(
        makeResponse({
          builds: [{ build: 42, downloads: { application: { name: 'custom-name.jar' } } }],
        }),
      );
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Paper', '1.21');
      expect(result?.downloadUrl).toContain('custom-name.jar');
    });

    it('generates default filename when application.name is absent', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ versions: ['1.21'] })).mockResolvedValueOnce(
        makeResponse({
          builds: [{ build: 5, downloads: {} }],
        }),
      );
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Paper', '1.21');
      expect(result?.downloadUrl).toContain('paper-1.21-5.jar');
    });

    it('returns null when versions array is empty', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ versions: [] }));
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Paper', '1.21');
      expect(result).toBeNull();
    });

    it('returns null when builds array is empty', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse({ versions: ['1.21'] }))
        .mockResolvedValueOnce(makeResponse({ builds: [] }));
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Paper', '1.21');
      expect(result).toBeNull();
    });
  });

  describe('LeafMC', () => {
    it('uses project=leafmc in the API URL', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ versions: ['1.21'] })).mockResolvedValueOnce(
        makeResponse({
          builds: [{ build: 1, downloads: { application: { name: 'leafmc-1.21-1.jar' } } }],
        }),
      );
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('LeafMC', '1.21');
      expect(fetchMock.mock.calls[0][0]).toContain('projects/leafmc');
      expect(result?.downloadUrl).toContain('leafmc');
    });
  });

  describe('Vanilla', () => {
    it('returns latestVersion and server JAR URL from version manifest', async () => {
      fetchMock
        .mockResolvedValueOnce(
          makeResponse({
            versions: [
              { id: '1.21', type: 'release', url: 'https://piston-meta.example.com/1.21.json' },
            ],
          }),
        )
        .mockResolvedValueOnce(
          makeResponse({
            downloads: { server: { url: 'https://launcher.mojang.com/v1/1.21/server.jar' } },
          }),
        );
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Vanilla', '1.21');
      expect(result?.latestVersion).toBe('1.21');
      expect(result?.downloadUrl).toBe('https://launcher.mojang.com/v1/1.21/server.jar');
    });

    it('skips snapshot entries and uses first release', async () => {
      fetchMock
        .mockResolvedValueOnce(
          makeResponse({
            versions: [
              { id: '25w10a', type: 'snapshot', url: 'https://example.com/snap.json' },
              { id: '1.21', type: 'release', url: 'https://example.com/1.21.json' },
            ],
          }),
        )
        .mockResolvedValueOnce(
          makeResponse({
            downloads: { server: { url: 'https://launcher.mojang.com/v1/1.21/server.jar' } },
          }),
        );
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Vanilla', '');
      expect(result?.latestVersion).toBe('1.21');
    });

    it('returns null when manifest has no release versions', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ versions: [] }));
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Vanilla', '');
      expect(result).toBeNull();
    });
  });

  describe('Fabric', () => {
    it('returns download URL with version parameter in the path', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse([{ version: '0.16.5' }, { version: '0.16.4' }]));
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Fabric', '1.21.4');
      expect(result?.latestVersion).toBe('1.21.4');
      expect(result?.downloadUrl).toContain('/1.21.4/0.16.5/');
      expect(result?.downloadUrl).toContain('meta.fabricmc.net');
    });

    it('uses the first loader version as the latest', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse([{ version: '0.99.0' }]));
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Fabric', '1.20');
      expect(result?.downloadUrl).toContain('0.99.0');
    });

    it('returns null when loaders array is empty', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse([]));
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Fabric', '1.21');
      expect(result).toBeNull();
    });
  });

  describe('Unsupported software', () => {
    it.each(['Spigot', 'Forge', 'Velocity', 'Waterfall', 'BungeeCord'])(
      'returns null for %s',
      async (software) => {
        const { resolveLatestJarUrl } = await import('../version-commands');
        const result = await resolveLatestJarUrl(software, '1.21');
        expect(result).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('Error handling', () => {
    it('returns null when fetch throws', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network failure'));
      const { resolveLatestJarUrl } = await import('../version-commands');
      const result = await resolveLatestJarUrl('Paper', '1.21');
      expect(result).toBeNull();
    });
  });
});
