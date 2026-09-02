import { getE2eScenario, getE2eState, recordE2eCall } from '../e2e/support/e2e-runtime';

const PAPER_TEST_JAR_URL = 'https://fill-data.papermc.io/v1/paper.jar';
const VALID_SHA256 = 'a'.repeat(64);
const VALID_SHA512 = 'a'.repeat(128);

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function paperBuildResponse(): Response {
  return jsonResponse([
    {
      channel: 'STABLE',
      downloads: {
        'server:default': {
          name: 'paper.jar',
          url: PAPER_TEST_JAR_URL,
          checksums: { sha256: '0'.repeat(64) },
        },
      },
    },
  ]);
}

function modrinthProject(): Record<string, unknown> {
  const incompatible = getE2eScenario() === 'incompatible-plugin';
  return {
    slug: 'veinminer',
    project_id: 'veinminer-project',
    title: 'VeinMiner',
    description: incompatible
      ? 'A plugin for Minecraft 1.20.1 only.'
      : 'A plugin for Minecraft 1.21.10.',
    author: 'Example',
    icon_url: '',
    downloads: 100,
    project_type: 'plugin',
  };
}

function modrinthVersion(): Record<string, unknown> {
  const hashless = getE2eScenario() === 'hashless-plugin';
  const incompatible = getE2eScenario() === 'incompatible-plugin';
  return {
    id: 'version-1',
    game_versions: [incompatible ? '1.20.1' : '1.21.10'],
    dependencies: [],
    files: [
      {
        filename: 'VeinMiner-1.21.4.jar',
        url: 'https://cdn.modrinth.example/veinminer.jar',
        primary: true,
        hashes: hashless ? undefined : { sha512: VALID_SHA512 },
      },
    ],
  };
}

function hangarProject(): Record<string, unknown> {
  return {
    name: 'WirelessRedstone',
    namespace: { owner: 'Example', slug: 'wireless-redstone' },
    stats: { downloads: 100, stars: 4 },
    description: 'A Paper plugin for Minecraft 1.21.10.',
    avatarUrl: '',
  };
}

function hangarVersion(): Record<string, unknown> {
  const hashless = getE2eScenario() === 'hashless-plugin';
  return {
    name: '2.0',
    downloads: {
      PAPER: {
        downloadUrl: 'https://cdn.hangar.example/wireless-redstone.jar',
        fileInfo: {
          name: 'WirelessRedstone-2.0.jar',
          ...(hashless ? {} : { sha256: VALID_SHA256 }),
        },
      },
    },
    platformDependencies: { PAPER: ['1.21.10'] },
  };
}

function spigotResource(): Record<string, unknown> {
  return {
    id: 1,
    name: 'VeinMiner',
    tag: 'Supports Minecraft 1.21.10',
    downloads: 100,
    premium: false,
    external: false,
    icon: { url: '' },
    author: { name: 'Example' },
    file: { url: 'https://api.spiget.org/v2/resources/1/download?version=1', type: 'JAR' },
  };
}

export async function fetch(url: string, _options?: unknown): Promise<Response> {
  recordE2eCall('http', 'fetch', { url });
  const state = getE2eState();

  if (url.includes('fill.papermc.io/v3/projects/paper/versions/') && url.endsWith('/builds')) {
    return paperBuildResponse();
  }

  if (url.includes('api.modrinth.com/v2/search')) {
    state.searchAttempts += 1;
    if (getE2eScenario() === 'search-failure' && state.searchAttempts <= 2) {
      throw new Error('E2E search network failure');
    }
    return jsonResponse({ hits: [modrinthProject()], total_hits: 1 });
  }

  if (url.includes('api.modrinth.com/v2/project/veinminer-project/version')) {
    return jsonResponse([modrinthVersion()]);
  }

  if (url.includes('api.modrinth.com/v2/version/version-1')) {
    return jsonResponse(modrinthVersion());
  }

  if (url.includes('api.modrinth.com/v2/project/veinminer-project')) {
    return jsonResponse({
      id: 'veinminer-project',
      slug: 'veinminer',
      title: 'VeinMiner',
      body: '# VeinMiner',
    });
  }

  if (url.includes('hangar.papermc.io/api/v1/projects') && url.includes('/versions')) {
    return jsonResponse({ result: [hangarVersion()], pagination: {} });
  }

  if (url === 'https://hangar.papermc.io/api/v1/projects' || url.includes('api/v1/projects?')) {
    return jsonResponse({ result: [hangarProject()], pagination: {} });
  }

  if (url.includes('hangar.papermc.io/api/v1/projects/Example/wireless-redstone')) {
    return jsonResponse({ description: 'A Paper plugin.', mainPageContent: '# WirelessRedstone' });
  }

  if (
    url.includes('api.spiget.org/v2/search/resources') ||
    url.includes('api.spiget.org/v2/resources/free')
  ) {
    return jsonResponse([spigotResource()]);
  }

  if (url.includes('api.spiget.org/v2/resources/1')) {
    return jsonResponse({ description: '<p>VeinMiner description</p>' });
  }

  return jsonResponse({});
}
