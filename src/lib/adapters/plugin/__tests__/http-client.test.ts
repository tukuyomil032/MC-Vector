import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: fetchMock,
}));

describe('fetchJson', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
  });

  it('adds Accept and User-Agent headers when not present', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({}),
    });
    const { fetchJson } = await import('../http-client');
    await fetchJson('https://example.com/api');
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('User-Agent')).toBe('MC-Vector/2.0');
  });

  it('does not overwrite existing Accept header', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({}),
    });
    const { fetchJson } = await import('../http-client');
    await fetchJson('https://example.com/api', { headers: { Accept: 'text/html' } });
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get('Accept')).toBe('text/html');
  });

  it('does not overwrite existing User-Agent header', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({}),
    });
    const { fetchJson } = await import('../http-client');
    await fetchJson('https://example.com/api', { headers: { 'User-Agent': 'custom/1.0' } });
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get('User-Agent')).toBe('custom/1.0');
  });

  it('returns parsed JSON response', async () => {
    const data = { id: 1, name: 'test' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue(data),
    });
    const { fetchJson } = await import('../http-client');
    const result = await fetchJson('https://example.com/api');
    expect(result).toEqual(data);
  });

  it('throws Error when response.ok is false', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: vi.fn(),
    });
    const { fetchJson } = await import('../http-client');
    await expect(fetchJson('https://example.com/api/missing')).rejects.toThrow(
      'API error 404 Not Found: https://example.com/api/missing',
    );
  });

  it('passes additional init options to fetch', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({}),
    });
    const { fetchJson } = await import('../http-client');
    await fetchJson('https://example.com/api', { method: 'POST', body: '{"a":1}' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
  });

  it('works when init is undefined', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({}),
    });
    const { fetchJson } = await import('../http-client');
    await expect(fetchJson('https://example.com/api')).resolves.not.toThrow();
  });

  it('passes the correct URL to fetch', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({}),
    });
    const { fetchJson } = await import('../http-client');
    await fetchJson('https://api.example.com/v2/projects');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v2/projects',
      expect.any(Object),
    );
  });
});
