import { fetch } from '@tauri-apps/plugin-http';

export const PLUGIN_API_TIMEOUT_MS = 15_000;

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'MC-Vector/2.0.59');
  }

  const controller = new AbortController();
  let timedOut = false;
  const callerSignal = init?.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Plugin API request timed out', 'TimeoutError'));
  }, PLUGIN_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`API error ${response.status} ${response.statusText}: ${url}`);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (timedOut) {
      throw new Error(
        `Plugin API request timed out after ${PLUGIN_API_TIMEOUT_MS / 1000} seconds: ${url}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}
