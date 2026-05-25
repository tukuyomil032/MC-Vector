import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const tauriInvokeMock = vi.fn();
const searchHangarProjectsMock = vi.fn();

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: fetchMock }));
vi.mock('../tauri-api', () => ({ tauriInvoke: tauriInvokeMock, tauriListen: vi.fn() }));
vi.mock('../adapters/plugin/hangar-adapter', () => ({
  searchHangarProjects: searchHangarProjectsMock,
}));

function makeFetchResponse(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? 'OK' : 'Not Found',
    json: vi.fn().mockResolvedValue(data),
  };
}

function makeHangarVersionResponse(
  name: string,
  platform: string,
  downloadUrl: string,
  gameVersions: string[],
) {
  return {
    name,
    downloads: {
      [platform]: {
        downloadUrl,
        externalUrl: '',
        fileInfo: { name: `plugin-${name}.jar` },
      },
    },
    platformDependencies: {
      [platform]: gameVersions,
    },
  };
}

describe('plugin-commands (Hangar)', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    tauriInvokeMock.mockReset();
    searchHangarProjectsMock.mockReset();
  });

  describe('searchHangar', () => {
    it('calls searchHangarProjects with limit=25 and returns result/pagination', async () => {
      const mockProject = {
        name: 'EssentialsX',
        namespace: { owner: 'EssX', slug: 'essentialsx' },
        stats: { downloads: 1000, stars: 50 },
        description: 'Essential commands',
        avatarUrl: '',
      };
      searchHangarProjectsMock.mockResolvedValueOnce({
        result: [mockProject],
        pagination: { offset: 0, limit: 25, count: 1 },
      });
      const { searchHangar } = await import('../plugin-commands');
      const result = await searchHangar('essentials', 0);
      expect(searchHangarProjectsMock).toHaveBeenCalledWith({
        query: 'essentials',
        offset: 0,
        limit: 25,
      });
      expect(result.result).toHaveLength(1);
      expect(result.result[0].name).toBe('EssentialsX');
    });

    it('propagates errors from the adapter', async () => {
      searchHangarProjectsMock.mockRejectedValueOnce(new Error('Hangar error'));
      const { searchHangar } = await import('../plugin-commands');
      await expect(searchHangar('fail', 0)).rejects.toThrow('Hangar error');
    });
  });

  describe('getHangarVersions', () => {
    it('includes platform param in URL when platform is provided', async () => {
      const versionRaw = makeHangarVersionResponse('1.0', 'PAPER', 'https://dl.example.com/p.jar', [
        '1.21',
      ]);
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ result: [versionRaw], pagination: {} }));
      const { getHangarVersions } = await import('../plugin-commands');
      await getHangarVersions('owner', 'slug', 'PAPER');
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('platform=PAPER');
    });

    it('omits platform param when no platform provided', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ result: [], pagination: {} }));
      const { getHangarVersions } = await import('../plugin-commands');
      await getHangarVersions('owner', 'slug');
      const [url] = fetchMock.mock.calls[0];
      expect(url).not.toContain('platform=');
      expect(url).toContain('limit=30');
    });

    it('URL-encodes owner and slug', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ result: [], pagination: {} }));
      const { getHangarVersions } = await import('../plugin-commands');
      await getHangarVersions('My Owner', 'my slug');
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('My%20Owner');
      expect(url).toContain('my%20slug');
    });

    it('falls back to no-platform request when platform request returns empty', async () => {
      fetchMock
        .mockResolvedValueOnce(makeFetchResponse({ result: [], pagination: {} }))
        .mockResolvedValueOnce(
          makeFetchResponse({
            result: [
              makeHangarVersionResponse('1.0', 'PAPER', 'https://dl.hangar.io/plugin.jar', [
                '1.21',
              ]),
            ],
            pagination: {},
          }),
        );
      const { getHangarVersions } = await import('../plugin-commands');
      const result = await getHangarVersions('owner', 'slug', 'PAPER');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
    });

    it('does not retry when platform is not provided', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ result: [], pagination: {} }));
      const { getHangarVersions } = await import('../plugin-commands');
      await getHangarVersions('owner', 'slug');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveHangarDownload', () => {
    it('resolves VELOCITY platform for velocity software', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          result: [
            makeHangarVersionResponse('1.0', 'VELOCITY', 'https://dl.example.com/p.jar', ['1.21']),
          ],
          pagination: {},
        }),
      );
      const { resolveHangarDownload } = await import('../plugin-commands');
      const result = await resolveHangarDownload({
        owner: 'o',
        slug: 's',
        software: 'velocity',
        minecraftVersion: '1.21',
      });
      expect(result).not.toBeNull();
      expect(result?.downloadUrl).toBe('https://dl.example.com/p.jar');
    });

    it('resolves WATERFALL platform for waterfall software', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          result: [
            makeHangarVersionResponse('1.0', 'WATERFALL', 'https://dl.example.com/p.jar', ['1.21']),
          ],
          pagination: {},
        }),
      );
      const { resolveHangarDownload } = await import('../plugin-commands');
      const result = await resolveHangarDownload({
        owner: 'o',
        slug: 's',
        software: 'waterfall',
        minecraftVersion: '1.21',
      });
      expect(result).not.toBeNull();
    });

    it('returns null when no versions found', async () => {
      // PAPER platform: empty → retry without platform → also empty
      fetchMock
        .mockResolvedValueOnce(makeFetchResponse({ result: [], pagination: {} }))
        .mockResolvedValueOnce(makeFetchResponse({ result: [], pagination: {} }));
      const { resolveHangarDownload } = await import('../plugin-commands');
      const result = await resolveHangarDownload({
        owner: 'o',
        slug: 's',
        software: 'paper',
        minecraftVersion: '1.21',
      });
      expect(result).toBeNull();
    });

    it('generates fileName from slug-versionName when fileInfo.name is absent', async () => {
      const versionWithoutFileName = {
        name: '2.5.0',
        downloads: {
          PAPER: { downloadUrl: 'https://dl.example.com/p.jar', externalUrl: '', fileInfo: null },
        },
        platformDependencies: { PAPER: ['1.21'] },
      };
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ result: [versionWithoutFileName], pagination: {} }),
      );
      const { resolveHangarDownload } = await import('../plugin-commands');
      const result = await resolveHangarDownload({
        owner: 'o',
        slug: 'my-plugin',
        software: 'paper',
        minecraftVersion: '1.21',
      });
      expect(result?.fileName).toContain('my-plugin');
    });

    it('marks compatible=true when minecraftVersion matches', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          result: [
            makeHangarVersionResponse('1.0', 'PAPER', 'https://dl.example.com/p.jar', ['1.21']),
          ],
          pagination: {},
        }),
      );
      const { resolveHangarDownload } = await import('../plugin-commands');
      const result = await resolveHangarDownload({
        owner: 'o',
        slug: 's',
        software: 'paper',
        minecraftVersion: '1.21',
      });
      expect(result?.compatible).toBe(true);
    });
  });

  describe('checkHangarCompatibility', () => {
    it('returns compatible=true when matching version exists', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          result: [
            makeHangarVersionResponse('1.0', 'PAPER', 'https://dl.example.com/p.jar', ['1.21']),
          ],
          pagination: {},
        }),
      );
      const { checkHangarCompatibility } = await import('../plugin-commands');
      const result = await checkHangarCompatibility({
        owner: 'o',
        slug: 's',
        software: 'paper',
        minecraftVersion: '1.21',
      });
      expect(result.compatible).toBe(true);
      expect(result.supportedVersions).toContain('1.21');
    });

    it('returns compatible=false when no matching version', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          result: [
            makeHangarVersionResponse('1.0', 'PAPER', 'https://dl.example.com/p.jar', ['1.20']),
          ],
          pagination: {},
        }),
      );
      const { checkHangarCompatibility } = await import('../plugin-commands');
      const result = await checkHangarCompatibility({
        owner: 'o',
        slug: 's',
        software: 'paper',
        minecraftVersion: '1.21',
      });
      expect(result.compatible).toBe(false);
    });

    it('returns compatible=false and empty supportedVersions when versions is empty', async () => {
      // PAPER platform: empty → retry without platform → also empty
      fetchMock
        .mockResolvedValueOnce(makeFetchResponse({ result: [], pagination: {} }))
        .mockResolvedValueOnce(makeFetchResponse({ result: [], pagination: {} }));
      const { checkHangarCompatibility } = await import('../plugin-commands');
      const result = await checkHangarCompatibility({
        owner: 'o',
        slug: 's',
        software: 'paper',
        minecraftVersion: '1.21',
      });
      expect(result.compatible).toBe(false);
      expect(result.supportedVersions).toEqual([]);
    });
  });

  describe('getHangarProjectBody', () => {
    it('returns mainPageContent when present', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ description: 'Short desc', mainPageContent: 'Full body text' }),
      );
      const { getHangarProjectBody } = await import('../plugin-commands');
      const result = await getHangarProjectBody('owner', 'slug');
      expect(result).toBe('Full body text');
    });

    it('falls back to description when mainPageContent is null', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ description: 'Short desc', mainPageContent: null }),
      );
      const { getHangarProjectBody } = await import('../plugin-commands');
      const result = await getHangarProjectBody('owner', 'slug');
      expect(result).toBe('Short desc');
    });

    it('returns null when both mainPageContent and description are empty', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ description: '', mainPageContent: '' }));
      const { getHangarProjectBody } = await import('../plugin-commands');
      const result = await getHangarProjectBody('owner', 'slug');
      expect(result).toBeNull();
    });
  });

  describe('installHangarProject', () => {
    it('calls download_file with correct dest path', async () => {
      const { installHangarProject } = await import('../plugin-commands');
      await installHangarProject('https://dl.hangar.io/plugin.jar', 'plugin.jar', '/plugins');
      expect(tauriInvokeMock).toHaveBeenCalledWith('download_file', {
        url: 'https://dl.hangar.io/plugin.jar',
        dest: '/plugins/plugin.jar',
        eventId: 'plugin-hangar',
      });
    });
  });
});
