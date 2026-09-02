import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: fetchMock }));

function makeResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    json: vi.fn().mockResolvedValue(data),
  };
}

describe('resolve jar URLs from official sources', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
  });

  it('uses PaperMC Fill stable builds and verifies the official download host', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse({ versions: { '1.21': ['1.21.10'] } }))
      .mockResolvedValueOnce(
        makeResponse([
          {
            id: 48,
            channel: 'STABLE',
            downloads: {
              'server:default': {
                name: 'paper-1.21.10-48.jar',
                url: 'https://fill-data.papermc.io/v1/paper-1.21.10-48.jar',
                checksums: { sha256: 'a'.repeat(64) },
              },
            },
          },
        ]),
      );

    const { resolveLatestJarUrl } = await import('@/lib/version-commands');
    const result = await resolveLatestJarUrl('Paper', '1.21');

    expect(result).toEqual({
      latestVersion: '1.21.10',
      downloadUrl: 'https://fill-data.papermc.io/v1/paper-1.21.10-48.jar',
      sha256: 'a'.repeat(64),
    });
  });

  it('falls back only to the official Paper v2 API', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Fill unavailable'))
      .mockResolvedValueOnce(makeResponse({ versions: ['1.21'] }))
      .mockResolvedValueOnce(
        makeResponse({
          builds: [
            { build: 100, channel: 'default', downloads: { application: { name: 'paper.jar' } } },
          ],
        }),
      );

    const { resolveLatestJarUrl } = await import('@/lib/version-commands');
    const result = await resolveLatestJarUrl('Paper', '1.21');

    expect(result?.downloadUrl).toContain('https://api.papermc.io/v2/projects/paper/');
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(
      expect.stringContaining('papermc.io/repository'),
    );
  });

  it('does not turn an official API failure into an unavailable version', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('url not allowed on the configured scope'))
      .mockResolvedValueOnce(makeResponse({}, 410));

    const { resolveRequestedJarUrl } = await import('@/lib/version-commands');

    await expect(resolveRequestedJarUrl('Paper', '26.2')).rejects.toThrow('HTTP 410');
  });

  it('uses LeafMC official API and never PaperMC API', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ versions: ['1.21'] })).mockResolvedValueOnce(
      makeResponse([
        {
          build: 37,
          downloads: {
            application: {
              name: 'leaf-1.21-37.jar',
              checksums: { sha256: 'b'.repeat(64) },
            },
          },
        },
      ]),
    );

    const { resolveLatestJarUrl } = await import('@/lib/version-commands');
    const result = await resolveLatestJarUrl('LeafMC', '1.21');

    expect(fetchMock.mock.calls.every(([url]) => url.includes('api.leafmc.one'))).toBe(true);
    expect(result?.downloadUrl).toContain('https://api.leafmc.one/v2/projects/leaf/');
    expect(result?.sha256).toBe('b'.repeat(64));
  });

  it('resolves Vanilla from Mojang metadata and data hosts only', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse({
          versions: [
            { id: '25w10a', type: 'snapshot', url: 'https://example.com/snapshot.json' },
            {
              id: '1.21.10',
              type: 'release',
              url: 'https://piston-meta.mojang.com/v1/1.21.10.json',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          downloads: {
            server: { url: 'https://piston-data.mojang.com/v1/1.21.10/server.jar' },
          },
        }),
      );

    const { resolveLatestJarUrl } = await import('@/lib/version-commands');
    const result = await resolveLatestJarUrl('Vanilla', '');

    expect(result?.latestVersion).toBe('1.21.10');
    expect(result?.downloadUrl).toBe('https://piston-data.mojang.com/v1/1.21.10/server.jar');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
    );
  });

  it('resolves Fabric loader and installer versions from the official Meta API', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse([
          { loader: { version: '0.16.5', stable: true } },
          { loader: { version: '0.16.4', stable: false } },
        ]),
      )
      .mockResolvedValueOnce(makeResponse([{ version: '1.0.1', stable: true }]));

    const { resolveLatestJarUrl } = await import('@/lib/version-commands');
    const result = await resolveLatestJarUrl('Fabric', '1.21.4');

    expect(result?.downloadUrl).toBe(
      'https://meta.fabricmc.net/v2/versions/loader/1.21.4/0.16.5/1.0.1/server/jar',
    );
  });

  it('resolves the requested Minecraft version for server creation', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse([
        {
          id: 48,
          channel: 'STABLE',
          downloads: {
            'server:default': {
              url: 'https://fill-data.papermc.io/v1/paper.jar',
            },
          },
        },
      ]),
    );

    const { resolveRequestedJarUrl } = await import('@/lib/version-commands');
    const result = await resolveRequestedJarUrl('Paper', '1.21.10');

    expect(fetchMock.mock.calls[0][0]).toContain('/projects/paper/versions/1.21.10/builds');
    expect(result?.latestVersion).toBe('1.21.10');
  });

  it.each(['Spigot', 'Forge', 'Velocity', 'Waterfall', 'BungeeCord'])(
    'does not auto-download unsupported software: %s',
    async (software) => {
      const { resolveRequestedJarUrl } = await import('@/lib/version-commands');
      await expect(resolveRequestedJarUrl(software, '1.21')).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('returns null for an unavailable version', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse([]));
    const { resolveRequestedJarUrl } = await import('@/lib/version-commands');
    await expect(resolveRequestedJarUrl('Paper', '9.99')).resolves.toBeNull();
  });
});
