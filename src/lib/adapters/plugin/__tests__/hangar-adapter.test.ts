import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchJsonMock = vi.fn();

vi.mock('../http-client', () => ({
  fetchJson: fetchJsonMock,
}));

const PAGINATION = { offset: 0, limit: 10, count: 1 };

const VALID_PROJECT_RAW = {
  name: 'EssentialsX',
  namespace: { owner: 'EssentialsX', slug: 'essentialsx' },
  stats: { downloads: 5000, stars: 200 },
  description: 'Essential commands plugin',
  avatarUrl: 'https://example.com/avatar.png',
};

describe('searchHangarProjects', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchJsonMock.mockReset();
  });

  it('sets query/offset/limit as URL search params', async () => {
    fetchJsonMock.mockResolvedValueOnce({ result: [], pagination: PAGINATION });
    const { searchHangarProjects } = await import('../hangar-adapter');
    await searchHangarProjects({ query: 'essentials', offset: 20, limit: 10 });
    const [url] = fetchJsonMock.mock.calls[0];
    expect(url).toContain('query=essentials');
    expect(url).toContain('offset=20');
    expect(url).toContain('limit=10');
  });

  it('uses hangar.papermc.io/api/v1/projects as the base URL', async () => {
    fetchJsonMock.mockResolvedValueOnce({ result: [], pagination: PAGINATION });
    const { searchHangarProjects } = await import('../hangar-adapter');
    await searchHangarProjects({ query: '', offset: 0, limit: 10 });
    const [url] = fetchJsonMock.mock.calls[0];
    expect(url).toContain('hangar.papermc.io/api/v1/projects');
  });

  it('parses a valid project correctly', async () => {
    fetchJsonMock.mockResolvedValueOnce({ result: [VALID_PROJECT_RAW], pagination: PAGINATION });
    const { searchHangarProjects } = await import('../hangar-adapter');
    const { result } = await searchHangarProjects({ query: 'essentials', offset: 0, limit: 10 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('EssentialsX');
    expect(result[0].namespace.owner).toBe('EssentialsX');
    expect(result[0].namespace.slug).toBe('essentialsx');
    expect(result[0].stats.downloads).toBe(5000);
    expect(result[0].stats.stars).toBe(200);
  });

  it('excludes projects missing namespace owner or slug', async () => {
    const invalidProject = {
      name: 'Bad',
      namespace: { owner: '', slug: '' },
      stats: {},
      description: '',
      avatarUrl: '',
    };
    fetchJsonMock.mockResolvedValueOnce({ result: [invalidProject], pagination: PAGINATION });
    const { searchHangarProjects } = await import('../hangar-adapter');
    const { result } = await searchHangarProjects({ query: '', offset: 0, limit: 10 });
    expect(result).toHaveLength(0);
  });

  it('excludes projects missing name', async () => {
    const noName = {
      name: '',
      namespace: { owner: 'owner', slug: 'slug' },
      stats: {},
      description: '',
      avatarUrl: '',
    };
    fetchJsonMock.mockResolvedValueOnce({ result: [noName], pagination: PAGINATION });
    const { searchHangarProjects } = await import('../hangar-adapter');
    const { result } = await searchHangarProjects({ query: '', offset: 0, limit: 10 });
    expect(result).toHaveLength(0);
  });

  it('returns empty array when result is not an array', async () => {
    fetchJsonMock.mockResolvedValueOnce({ result: null, pagination: PAGINATION });
    const { searchHangarProjects } = await import('../hangar-adapter');
    const { result } = await searchHangarProjects({ query: '', offset: 0, limit: 10 });
    expect(result).toEqual([]);
  });

  it('returns empty array when result array is empty', async () => {
    fetchJsonMock.mockResolvedValueOnce({ result: [], pagination: PAGINATION });
    const { searchHangarProjects } = await import('../hangar-adapter');
    const { result } = await searchHangarProjects({ query: '', offset: 0, limit: 10 });
    expect(result).toEqual([]);
  });

  it('passes pagination from the response through as-is', async () => {
    fetchJsonMock.mockResolvedValueOnce({ result: [], pagination: PAGINATION });
    const { searchHangarProjects } = await import('../hangar-adapter');
    const { pagination } = await searchHangarProjects({ query: '', offset: 0, limit: 10 });
    expect(pagination).toEqual(PAGINATION);
  });

  it('defaults missing stats to 0', async () => {
    const noStats = {
      name: 'Plugin',
      namespace: { owner: 'o', slug: 's' },
      stats: null,
      description: '',
      avatarUrl: '',
    };
    fetchJsonMock.mockResolvedValueOnce({ result: [noStats], pagination: PAGINATION });
    const { searchHangarProjects } = await import('../hangar-adapter');
    const { result } = await searchHangarProjects({ query: '', offset: 0, limit: 10 });
    expect(result[0].stats.downloads).toBe(0);
    expect(result[0].stats.stars).toBe(0);
  });

  it('propagates errors from fetchJson', async () => {
    fetchJsonMock.mockRejectedValueOnce(new Error('Network error'));
    const { searchHangarProjects } = await import('../hangar-adapter');
    await expect(searchHangarProjects({ query: '', offset: 0, limit: 10 })).rejects.toThrow(
      'Network error',
    );
  });
});
