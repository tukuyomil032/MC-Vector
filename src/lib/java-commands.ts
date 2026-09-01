import { open } from '@tauri-apps/plugin-dialog';
import { load } from '@tauri-apps/plugin-store';
import { logError } from './error-utils';
import { type UnlistenFn, tauriInvoke, tauriListen } from './tauri-api';

const STORE_NAME = 'config.json';

export interface JavaVersion {
  version: number;
  path: string;
  name: string;
  isCustom?: boolean;
}

export async function getJavaVersions(): Promise<JavaVersion[]> {
  const store = await load(STORE_NAME);
  return (await store.get<JavaVersion[]>('javaVersions')) ?? [];
}

export async function saveJavaVersions(versions: JavaVersion[]): Promise<void> {
  const store = await load(STORE_NAME);
  await store.set('javaVersions', versions);
  await store.save();
}

/**
 * Download and install a specific Java major version (e.g. 8, 17, 21).
 * Resolves the Adoptium URL internally and saves to app data dir.
 */
export async function downloadJava(majorVersion: number): Promise<boolean> {
  try {
    const javaHome = await tauriInvoke<string>('download_java', {
      majorVersion,
    });
    // Register in store
    const versions = await getJavaVersions();
    const existing = versions.findIndex((v) => v.version === majorVersion);
    const entry: JavaVersion = {
      version: majorVersion,
      path: javaHome,
      name: `Java ${majorVersion}`,
    };
    if (existing >= 0) {
      versions[existing] = entry;
    } else {
      versions.push(entry);
    }
    await saveJavaVersions(versions);
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
  const versions = await getJavaVersions();
  const target = versions.find((v) => v.version === majorVersion);
  if (!target) {
    return;
  }

  if (target.isCustom) {
    await saveJavaVersions(versions.filter((v) => v.version !== majorVersion));
    return;
  }

  await tauriInvoke('delete_managed_path', {
    request: { root: 'java', relativePath: `jdk-${majorVersion}` },
  });

  await saveJavaVersions(versions.filter((v) => v.version !== majorVersion));
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
