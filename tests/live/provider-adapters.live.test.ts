import { expect, test } from 'vitest';
import { searchHangarProjects } from '../../src/lib/adapters/plugin/hangar-adapter';
import { searchModrinthProjects } from '../../src/lib/adapters/plugin/modrinth-adapter';
import { searchSpigotResources } from '../../src/lib/adapters/plugin/spigot-adapter';

async function fetchAdoptiumMetadata(): Promise<unknown> {
  const response = await fetch('https://api.adoptium.net/v3/info/available_releases', {
    headers: { Accept: 'application/json', 'User-Agent': 'MC-Vector live canary' },
  });
  if (!response.ok) {
    throw new Error(`Adoptium metadata returned HTTP ${response.status}`);
  }
  return response.json();
}

test('production provider adapters expose read-only search results', async (context) => {
  try {
    const [modrinth, hangar, spiget, adoptium] = await Promise.all([
      searchModrinthProjects({ query: 'luckperms', facets: '', offset: 0, limit: 1 }),
      searchHangarProjects({ query: 'luckperms', offset: 0, limit: 1 }),
      searchSpigotResources({ query: 'luckperms', page: 1, size: 1 }),
      fetchAdoptiumMetadata(),
    ]);

    expect(Array.isArray(modrinth.hits)).toBe(true);
    expect(typeof modrinth.total_hits).toBe('number');
    expect(Array.isArray(hangar.result)).toBe(true);
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
