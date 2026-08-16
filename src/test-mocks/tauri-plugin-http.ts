const PAPER_TEST_JAR_URL = 'https://fill-data.papermc.io/v1/paper.jar';

function paperBuildResponse(): Response {
  return new Response(
    JSON.stringify([
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
    ]),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

export async function fetch(url: string, _options?: unknown): Promise<Response> {
  if (url.includes('fill.papermc.io/v3/projects/paper/versions/') && url.endsWith('/builds')) {
    return paperBuildResponse();
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
