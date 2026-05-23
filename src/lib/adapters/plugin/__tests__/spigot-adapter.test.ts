import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchJsonMock = vi.fn();

vi.mock('../http-client', () => ({
  fetchJson: fetchJsonMock,
}));

const VALID_RESOURCE_RAW = {
  id: 83557,
  name: 'EssentialsX',
  tag: 'Essential commands',
  downloads: 1000000,
  premium: false,
  external: false,
  icon: { url: 'data/resource_icons/83/83557.jpg' },
  author: { name: 'EssentialsX Team' },
  file: { type: 'jar', url: '/resources/essentialsx.83557?version=12345' },
};

describe('searchSpigotResources', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchJsonMock.mockReset();
  });

  it('uses /resources/free endpoint when query is empty', async () => {
    fetchJsonMock.mockResolvedValueOnce([]);
    const { searchSpigotResources } = await import('../spigot-adapter');
    await searchSpigotResources({ query: '', page: 1, size: 10 });
    const [url] = fetchJsonMock.mock.calls[0];
    expect(url).toContain('/v2/resources/free');
  });

  it('uses /search/resources endpoint when query is non-empty', async () => {
    fetchJsonMock.mockResolvedValueOnce([]);
    const { searchSpigotResources } = await import('../spigot-adapter');
    await searchSpigotResources({ query: 'essentials', page: 1, size: 10 });
    const [url] = fetchJsonMock.mock.calls[0];
    expect(url).toContain('/v2/search/resources/');
    expect(url).toContain('essentials');
  });

  it('uses /resources/free when query is only whitespace', async () => {
    fetchJsonMock.mockResolvedValueOnce([]);
    const { searchSpigotResources } = await import('../spigot-adapter');
    await searchSpigotResources({ query: '   ', page: 1, size: 10 });
    const [url] = fetchJsonMock.mock.calls[0];
    expect(url).toContain('/v2/resources/free');
  });

  it('sets size and page as URL params with sort=-downloads', async () => {
    fetchJsonMock.mockResolvedValueOnce([]);
    const { searchSpigotResources } = await import('../spigot-adapter');
    await searchSpigotResources({ query: '', page: 3, size: 20 });
    const [url] = fetchJsonMock.mock.calls[0];
    expect(url).toContain('size=20');
    expect(url).toContain('page=3');
    expect(url).toContain('sort=-downloads');
  });

  it('clamps page to minimum 1 when page is 0', async () => {
    fetchJsonMock.mockResolvedValueOnce([]);
    const { searchSpigotResources } = await import('../spigot-adapter');
    await searchSpigotResources({ query: '', page: 0, size: 10 });
    const [url] = fetchJsonMock.mock.calls[0];
    expect(url).toContain('page=1');
  });

  it('parses a valid resource correctly', async () => {
    fetchJsonMock.mockResolvedValueOnce([VALID_RESOURCE_RAW]);
    const { searchSpigotResources } = await import('../spigot-adapter');
    const result = await searchSpigotResources({ query: '', page: 1, size: 10 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(83557);
    expect(result[0].name).toBe('EssentialsX');
    expect(result[0].downloads).toBe(1000000);
    expect(result[0].authorName).toBe('EssentialsX Team');
    expect(result[0].fileType).toBe('jar');
  });

  it('converts relative iconUrl to absolute spigotmc.org URL', async () => {
    fetchJsonMock.mockResolvedValueOnce([VALID_RESOURCE_RAW]);
    const { searchSpigotResources } = await import('../spigot-adapter');
    const result = await searchSpigotResources({ query: '', page: 1, size: 10 });
    expect(result[0].iconUrl).toContain('https://www.spigotmc.org/');
  });

  it('keeps absolute iconUrl as-is', async () => {
    const resource = { ...VALID_RESOURCE_RAW, icon: { url: 'https://example.com/icon.png' } };
    fetchJsonMock.mockResolvedValueOnce([resource]);
    const { searchSpigotResources } = await import('../spigot-adapter');
    const result = await searchSpigotResources({ query: '', page: 1, size: 10 });
    expect(result[0].iconUrl).toBe('https://example.com/icon.png');
  });

  it('extracts latestVersionId from file URL version param', async () => {
    fetchJsonMock.mockResolvedValueOnce([VALID_RESOURCE_RAW]);
    const { searchSpigotResources } = await import('../spigot-adapter');
    const result = await searchSpigotResources({ query: '', page: 1, size: 10 });
    expect(result[0].latestVersionId).toBe(12345);
  });

  it('excludes resources with id < 0 or missing name', async () => {
    const badResources = [
      { id: -1, name: 'bad', tag: '', downloads: 0, premium: false, external: false },
      { id: 1, name: '', tag: '', downloads: 0, premium: false, external: false },
    ];
    fetchJsonMock.mockResolvedValueOnce(badResources);
    const { searchSpigotResources } = await import('../spigot-adapter');
    const result = await searchSpigotResources({ query: '', page: 1, size: 10 });
    expect(result).toHaveLength(0);
  });
});
