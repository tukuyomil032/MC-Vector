import { expect, test } from 'vitest';

async function providerJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'MC-Vector live canary' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Provider metadata returned HTTP ${response.status}`);
  return response.json();
}

async function fetchAdoptiumMetadata(): Promise<unknown> {
  const response = await fetch('https://api.adoptium.net/v3/info/available_releases', {
    headers: { Accept: 'application/json', 'User-Agent': 'MC-Vector live canary' },
  });
  if (!response.ok) {
    throw new Error(`Adoptium metadata returned HTTP ${response.status}`);
  }
  return response.json();
}

test('upstream provider APIs expose expected read-only search shapes', async (context) => {
  try {
    const [modrinth, hangar, spiget, adoptium] = await Promise.all([
      providerJson('https://api.modrinth.com/v2/search?query=luckperms&limit=1'),
      providerJson('https://hangar.papermc.io/api/v1/projects?query=luckperms&limit=1'),
      providerJson('https://api.spiget.org/v2/search/resources/luckperms?page=1&size=1'),
      fetchAdoptiumMetadata(),
    ]);

    expect(Array.isArray((modrinth as { hits?: unknown }).hits)).toBe(true);
    expect(typeof (modrinth as { total_hits?: unknown }).total_hits).toBe('number');
    expect(Array.isArray((hangar as { result?: unknown }).result)).toBe(true);
    expect(Array.isArray(spiget)).toBe(true);
    expect(adoptium).toBeTypeOf('object');
  } catch (error) {
    // The command is a scheduled canary, not a PR gate. A restricted local
    // network should not be represented as a product failure.
    const message = error instanceof Error ? error.message : String(error);
    if (
      process.env.CI !== 'true' &&
      /fetch failed|network|timeout|ENOTFOUND|ECONN|socket/i.test(message)
    ) {
      context.skip(`live provider network unavailable: ${message}`);
      return;
    }
    throw error;
  }
});
