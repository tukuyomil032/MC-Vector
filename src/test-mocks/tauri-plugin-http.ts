export async function fetch(_url: string, _options?: unknown): Promise<Response> {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
