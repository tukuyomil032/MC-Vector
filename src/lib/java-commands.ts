import { open } from '@tauri-apps/plugin-dialog';
import { logError } from './error-utils';
import { type UnlistenFn, tauriInvoke, tauriListen } from './tauri-api';

export interface JavaVersion {
  version: number;
  path: string;
  name: string;
  isCustom?: boolean;
}

export async function getJavaVersions(): Promise<JavaVersion[]> {
  return tauriInvoke<JavaVersion[]>('get_java_versions');
}

/**
 * Download and install a specific Java major version (e.g. 8, 17, 21).
 * Resolves the Adoptium URL internally and saves to app data dir.
 */
export async function downloadJava(majorVersion: number): Promise<boolean> {
  try {
    await tauriInvoke<string>('download_java', {
      majorVersion,
    });
    return true;
  } catch (e) {
    logError('downloadJava failed', e, { majorVersion });
    return false;
  }
}

/**
 * Delete an installed Java version by major version number.
 */
export async function deleteJava(majorVersion: number): Promise<void> {
  await tauriInvoke<void>('delete_java', { majorVersion });
}

export async function selectJavaBinary(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'Java Binary',
        extensions: ['*'],
      },
    ],
  });
  if (!selected) return null;
  return selected as string;
}

export function onJavaDownloadProgress(
  callback: (data: { progress: number }) => void,
): Promise<UnlistenFn> {
  return tauriListen('java-download-progress', callback);
}
