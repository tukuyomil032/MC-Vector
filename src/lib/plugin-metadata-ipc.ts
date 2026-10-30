import { tauriInvoke } from './tauri-api';

// Tauri invoke has no AbortSignal transport. Suppress stale search results and
// release the listener promptly; the backend independently bounds HTTP duration.
export function invokePluginMetadata<T>(
  command: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Plugin search aborted', 'AbortError'));
  }
  if (!signal) return tauriInvoke<T>(command, args);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Plugin search aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    tauriInvoke<T>(command, args).then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
