import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchJsonMock = vi.fn();

vi.mock('../http-client', () => ({
  fetchJson: fetchJsonMock,
}));

describe('searchModrinthProjects', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchJsonMock.mockReset();
  });

  it('sets query/offset/limit as URL search params', async () => {
    fetchJsonMock.mockResolvedValueOnce({ hits: [], total_hits: 0 });
    const { searchModrinthProjects } = await import('../modrinth-adapter');
    await searchModrinthProjects({ query: 'worldedit', facets: '', offset: 10, limit: 20 });
    const [url] = fetchJsonMock.mock.calls[0];
    expect(url).toContain('query=worldedit');
    expect(url).toContain('offset=10');
    expect(url).toContain('limit=20');
  });

  it('adds facets param when facets is non-empty', async () => {
    fetchJsonMock.mockResolvedValueOnce({ hits: [], total_hits: 0 });
    const { searchModrinthProjects } = await import('../modrinth-adapter');
    await searchModrinthProjects({
      query: 'test',
      facets: '[["project_type:plugin"]]',
      offset: 0,
      limit: 10,
    });
    const [url] = fetchJsonMock.mock.calls[0];
    expect(url).toContain('facets=');
  });

  it('omits facets param when facets is empty string', async () => {
    fetchJsonMock.mockResolvedValueOnce({ hits: [], total_hits: 0 });
    const { searchModrinthProjects } = await import('../modrinth-adapter');
    await searchModrinthProjects({ query: 'test', facets: '', offset: 0, limit: 10 });
    const [url] = fetchJsonMock.mock.calls[0];
    expect(url).not.toContain('facets=');
  });

  it('returns the fetchJson response as-is', async () => {
    const mockResult = {
      hits: [
        {
          slug: 'we',
          project_id: '1',
          title: 'WorldEdit',
          description: 'Edit',
          icon_url: '',
          downloads: 1000,
          project_type: 'plugin',
        },
      ],
      total_hits: 1,
    };
    fetchJsonMock.mockResolvedValueOnce(mockResult);
    const { searchModrinthProjects } = await import('../modrinth-adapter');
    const result = await searchModrinthProjects({ query: 'we', facets: '', offset: 0, limit: 10 });
    expect(result).toEqual(mockResult);
  });

  it('propagates errors from fetchJson', async () => {
    fetchJsonMock.mockRejectedValueOnce(new Error('API error 500'));
    const { searchModrinthProjects } = await import('../modrinth-adapter');
    await expect(
      searchModrinthProjects({ query: 'fail', facets: '', offset: 0, limit: 10 }),
    ).rejects.toThrow('API error 500');
  });

  it('uses https://api.modrinth.com/v2/search as the base URL', async () => {
    fetchJsonMock.mockResolvedValueOnce({ hits: [], total_hits: 0 });
    const { searchModrinthProjects } = await import('../modrinth-adapter');
    await searchModrinthProjects({ query: '', facets: '', offset: 0, limit: 10 });
    const [url] = fetchJsonMock.mock.calls[0];
    expect(url).toContain('api.modrinth.com/v2/search');
  });

  it('returns hits and total_hits from the response', async () => {
    fetchJsonMock.mockResolvedValueOnce({
      hits: [
        {
          slug: 'a',
          title: 'A',
          description: '',
          icon_url: '',
          downloads: 5,
          project_type: 'plugin',
        },
      ],
      total_hits: 1,
    });
    const { searchModrinthProjects } = await import('../modrinth-adapter');
    const result = await searchModrinthProjects({ query: 'a', facets: '', offset: 0, limit: 5 });
    expect(result.hits).toHaveLength(1);
    expect(result.total_hits).toBe(1);
  });
});
