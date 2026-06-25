import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const tauriInvokeMock = vi.fn();
const searchSpigotResourcesMock = vi.fn();

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: fetchMock }));
vi.mock('../tauri-api', () => ({ tauriInvoke: tauriInvokeMock, tauriListen: vi.fn() }));
vi.mock('../adapters/plugin/spigot-adapter', () => ({
  searchSpigotResources: searchSpigotResourcesMock,
}));

function makeFetchResponse(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? 'OK' : 'Not Found',
    json: vi.fn().mockResolvedValue(data),
  };
}

function base64Encode(text: string): string {
  return btoa(text);
}

describe('plugin-commands (Spigot)', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    tauriInvokeMock.mockReset();
    searchSpigotResourcesMock.mockReset();
  });

  describe('searchSpigot', () => {
    it('calls searchSpigotResources and returns resources', async () => {
      const mockResource = {
        id: 1,
        name: 'EssentialsX',
        tag: '',
        downloads: 1000,
        premium: false,
        external: false,
      };
      searchSpigotResourcesMock.mockResolvedValueOnce([mockResource]);
      const { searchSpigot } = await import('../plugin-commands');
      const result = await searchSpigot('essentials', 1, 25);
      expect(searchSpigotResourcesMock).toHaveBeenCalledWith({
        query: 'essentials',
        page: 1,
        size: 25,
      });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('EssentialsX');
    });

    it('propagates errors from the adapter', async () => {
      searchSpigotResourcesMock.mockRejectedValueOnce(new Error('Spiget error'));
      const { searchSpigot } = await import('../plugin-commands');
      await expect(searchSpigot('fail', 1, 10)).rejects.toThrow('Spiget error');
    });
  });

  describe('getSpigotResourceBody', () => {
    it('returns decoded description when present', async () => {
      const encoded = base64Encode('This is a description');
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ description: encoded }));
      const { getSpigotResourceBody } = await import('../plugin-commands');
      const result = await getSpigotResourceBody(12345);
      expect(result).toBe('This is a description');
    });

    it('returns null when description is empty', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ description: '' }));
      const { getSpigotResourceBody } = await import('../plugin-commands');
      const result = await getSpigotResourceBody(12345);
      expect(result).toBeNull();
    });

    it('returns null when payload is not a record', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse(null));
      const { getSpigotResourceBody } = await import('../plugin-commands');
      const result = await getSpigotResourceBody(12345);
      expect(result).toBeNull();
    });

    it('calls the correct Spiget API endpoint', async () => {
      fetchMock.mockResolvedValueOnce(makeFetchResponse({ description: '' }));
      const { getSpigotResourceBody } = await import('../plugin-commands');
      await getSpigotResourceBody(83557);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/v2/resources/83557');
    });
  });

  describe('downloadPlugin', () => {
    it('calls download_file with url/dest/eventId', async () => {
      const { downloadPlugin } = await import('../plugin-commands');
      await downloadPlugin('https://example.com/plugin.jar', '/plugins/plugin.jar', 'event-1');
      expect(tauriInvokeMock).toHaveBeenCalledWith('download_file', {
        url: 'https://example.com/plugin.jar',
        dest: '/plugins/plugin.jar',
        eventId: 'event-1',
      });
    });
  });

  describe('installSpigotProject', () => {
    it('calls download_file with the correct Spiget download URL', async () => {
      const { installSpigotProject } = await import('../plugin-commands');
      await installSpigotProject(83557, 'essentials.jar', '/plugins');
      const [cmd, args] = tauriInvokeMock.mock.calls[0];
      expect(cmd).toBe('download_file');
      expect(args.url).toContain('/v2/resources/83557/download');
      expect(args.dest).toBe('/plugins/essentials.jar');
    });

    it('adds version param to URL when versionId is provided', async () => {
      const { installSpigotProject } = await import('../plugin-commands');
      await installSpigotProject(83557, 'essentials.jar', '/plugins', 99);
      const [, args] = tauriInvokeMock.mock.calls[0];
      expect(args.url).toContain('version=99');
    });

    it('omits version param when versionId is not provided', async () => {
      const { installSpigotProject } = await import('../plugin-commands');
      await installSpigotProject(83557, 'essentials.jar', '/plugins');
      const [, args] = tauriInvokeMock.mock.calls[0];
      expect(args.url).not.toContain('version=');
    });

    it('omits version param when versionId is 0 or negative', async () => {
      const { installSpigotProject } = await import('../plugin-commands');
      await installSpigotProject(83557, 'essentials.jar', '/plugins', 0);
      const [, args] = tauriInvokeMock.mock.calls[0];
      expect(args.url).not.toContain('version=');
    });

    it('includes resourceId in eventId', async () => {
      const { installSpigotProject } = await import('../plugin-commands');
      await installSpigotProject(83557, 'essentials.jar', '/plugins');
      const [, args] = tauriInvokeMock.mock.calls[0];
      expect(args.eventId).toContain('83557');
    });
  });
});
