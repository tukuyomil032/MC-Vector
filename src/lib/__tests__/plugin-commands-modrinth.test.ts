import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const tauriInvokeMock = vi.fn();
const searchModrinthProjectsMock = vi.fn();

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: fetchMock }));
vi.mock('../tauri-api', () => ({ tauriInvoke: tauriInvokeMock, tauriListen: vi.fn() }));
vi.mock('../adapters/plugin/modrinth-adapter', () => ({
  searchModrinthProjects: searchModrinthProjectsMock,
}));

function makeFetchResponse(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? 'OK' : 'Not Found',
    json: vi.fn().mockResolvedValue(data),
  };
}

describe('plugin-commands (Modrinth)', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    tauriInvokeMock.mockReset();
    searchModrinthProjectsMock.mockReset();
  });

  describe('searchModrinth', () => {
    it('calls searchModrinthProjects and returns hits/total_hits', async () => {
      const mockHit = {
        slug: 'we',
        project_id: '1',
        title: 'WorldEdit',
        description: 'Edit',
        icon_url: '',
        downloads: 100,
        project_type: 'plugin',
      };
      searchModrinthProjectsMock.mockResolvedValueOnce({ hits: [mockHit], total_hits: 1 });
      const { searchModrinth } = await import('../plugin-commands');
      const result = await searchModrinth('worldedit', '', 0, 10);
      expect(searchModrinthProjectsMock).toHaveBeenCalledWith({
        query: 'worldedit',
        facets: '',
        offset: 0,
        limit: 10,
      });
      expect(result.hits).toHaveLength(1);
      expect(result.total_hits).toBe(1);
    });

    it('propagates errors from the adapter', async () => {
      searchModrinthProjectsMock.mockRejectedValueOnce(new Error('API error'));
      const { searchModrinth } = await import('../plugin-commands');
      await expect(searchModrinth('fail', '', 0, 10)).rejects.toThrow('API error');
    });
  });

  describe('getModrinthVersions', () => {
    it('returns the versions array from the API', async () => {
      const versions = [{ id: 'v1' }, { id: 'v2' }];
      fetchMock.mockResolvedValueOnce(makeFetchResponse(versions));
      const { getModrinthVersions } = await import('../plugin-commands');
      const result = await getModrinthVersions('project-abc');
      expect(result).toEqual(versions);
      expect(fetchMock.mock.calls[0][0]).toContain('project/project-abc/version');
    });

    it('throws when fetch fails', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse(null, false));
      const { getModrinthVersions } = await import('../plugin-commands');
      await expect(getModrinthVersions('bad-id')).rejects.toThrow('API error');
    });
  });

  describe('getCompatibleModrinthVersion', () => {
    const VERSION_RAW = {
      id: 'v1',
      files: [{ filename: 'worldedit-7.jar' }],
      game_versions: ['1.21'],
      dependencies: [],
    };

    it('returns parsed version matching loader and minecraft version', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse([VERSION_RAW]));
      const { getCompatibleModrinthVersion } = await import('../plugin-commands');
      const result = await getCompatibleModrinthVersion({
        projectId: 'p1',
        loader: 'paper',
        minecraftVersion: '1.21',
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe('v1');
      expect(result?.fileName).toBe('worldedit-7.jar');
    });

    it('adds loaders and game_versions query params when provided', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse([VERSION_RAW]));
      const { getCompatibleModrinthVersion } = await import('../plugin-commands');
      await getCompatibleModrinthVersion({
        projectId: 'p1',
        loader: 'paper',
        minecraftVersion: '1.21',
      });
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('loaders=');
      expect(url).toContain('game_versions=');
    });

    it('omits loaders param when loader is empty', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse([VERSION_RAW]));
      const { getCompatibleModrinthVersion } = await import('../plugin-commands');
      await getCompatibleModrinthVersion({ projectId: 'p1', loader: '', minecraftVersion: '1.21' });
      const [url] = fetchMock.mock.calls[0];
      expect(url).not.toContain('loaders=');
    });

    it('returns null when payload is empty array', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse([]));
      const { getCompatibleModrinthVersion } = await import('../plugin-commands');
      const result = await getCompatibleModrinthVersion({
        projectId: 'p1',
        loader: '',
        minecraftVersion: '',
      });
      expect(result).toBeNull();
    });

    it('returns null when version has no files', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse([{ id: 'v1', files: [], game_versions: [], dependencies: [] }]),
      );
      const { getCompatibleModrinthVersion } = await import('../plugin-commands');
      const result = await getCompatibleModrinthVersion({
        projectId: 'p1',
        loader: '',
        minecraftVersion: '',
      });
      expect(result).toBeNull();
    });
  });

  describe('getModrinthVersionById', () => {
    it('returns parsed version when valid payload', async () => {
      const raw = {
        id: 'v42',
        files: [{ filename: 'plugin.jar' }],
        game_versions: ['1.20', '1.21'],
        dependencies: [
          { dependency_type: 'required', project_id: 'dep1', version_id: null, file_name: null },
        ],
      };
      fetchMock.mockResolvedValueOnce(makeFetchResponse(raw));
      const { getModrinthVersionById } = await import('../plugin-commands');
      const result = await getModrinthVersionById('v42');
      expect(result?.id).toBe('v42');
      expect(result?.fileName).toBe('plugin.jar');
      expect(result?.gameVersions).toContain('1.21');
      expect(result?.dependencies).toHaveLength(1);
    });

    it('returns null when files array is empty', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ id: 'v1', files: [], game_versions: [], dependencies: [] }),
      );
      const { getModrinthVersionById } = await import('../plugin-commands');
      const result = await getModrinthVersionById('v1');
      expect(result).toBeNull();
    });
  });

  describe('getModrinthProjectIdentity', () => {
    it('returns id/slug/title when all present', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ id: 'abc123', slug: 'worldedit', title: 'WorldEdit' }),
      );
      const { getModrinthProjectIdentity } = await import('../plugin-commands');
      const result = await getModrinthProjectIdentity('abc123');
      expect(result?.id).toBe('abc123');
      expect(result?.slug).toBe('worldedit');
      expect(result?.title).toBe('WorldEdit');
    });

    it('returns null when id is missing', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ slug: 'worldedit', title: 'WorldEdit' }));
      const { getModrinthProjectIdentity } = await import('../plugin-commands');
      const result = await getModrinthProjectIdentity('missing-id');
      expect(result).toBeNull();
    });
  });

  describe('getModrinthProjectBody', () => {
    it('returns body when non-empty', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({ body: 'This is the project description.' }),
      );
      const { getModrinthProjectBody } = await import('../plugin-commands');
      const result = await getModrinthProjectBody('proj-1');
      expect(result).toBe('This is the project description.');
    });

    it('returns null when body is empty string', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ body: '   ' }));
      const { getModrinthProjectBody } = await import('../plugin-commands');
      const result = await getModrinthProjectBody('proj-1');
      expect(result).toBeNull();
    });
  });

  describe('installModrinthProject', () => {
    it('calls download_file with matching fileName', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          files: [
            { filename: 'worldedit-7.jar', url: 'https://cdn.example.com/we7.jar', primary: true },
            { filename: 'worldedit-6.jar', url: 'https://cdn.example.com/we6.jar', primary: false },
          ],
        }),
      );
      const { installModrinthProject } = await import('../plugin-commands');
      await installModrinthProject('v1', 'worldedit-7.jar', '/plugins');
      expect(tauriInvokeMock).toHaveBeenCalledWith(
        'download_file',
        expect.objectContaining({
          url: 'https://cdn.example.com/we7.jar',
          dest: '/plugins/worldedit-7.jar',
        }),
      );
    });

    it('falls back to primary file when fileName does not match', async () => {
      fetchMock.mockResolvedValueOnce(
        makeFetchResponse({
          files: [
            { filename: 'worldedit-7.jar', url: 'https://cdn.example.com/we7.jar', primary: true },
          ],
        }),
      );
      const { installModrinthProject } = await import('../plugin-commands');
      await installModrinthProject('v1', '', '/plugins');
      expect(tauriInvokeMock).toHaveBeenCalledWith(
        'download_file',
        expect.objectContaining({
          url: 'https://cdn.example.com/we7.jar',
        }),
      );
    });

    it('throws when files array is empty', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ files: [] }));
      const { installModrinthProject } = await import('../plugin-commands');
      await expect(installModrinthProject('v1', '', '/plugins')).rejects.toThrow();
    });

    it('throws when payload lacks files property', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ id: 'v1' }));
      const { installModrinthProject } = await import('../plugin-commands');
      await expect(installModrinthProject('v1', '', '/plugins')).rejects.toThrow(
        'Failed to parse Modrinth version payload',
      );
    });
  });
});
