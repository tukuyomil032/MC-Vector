import { tauriInvoke, tauriListen, type UnlistenFn } from './tauri-api';
import { load } from '@tauri-apps/plugin-store';
import { open } from '@tauri-apps/plugin-dialog';
import { remove } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';
import { platform, arch } from '@tauri-apps/plugin-os';

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
    const dataDir = await appDataDir();
    const installDir = `${dataDir}/java/jdk-${majorVersion}`;
    const archiveType = getOs() === 'windows' ? 'zip' : 'tar.gz';
    // Use Rust command to download and extract
    const javaHome = await tauriInvoke<string>('download_java', {
      downloadUrl: `https://api.adoptium.net/v3/binary/latest/${majorVersion}/ga/${getOs()}/${getArch()}/jdk/hotspot/normal/eclipse?project=jdk`,
      installDir,
      archiveType,
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
    console.error('downloadJava failed:', e);
    return false;
  }
}

function getOs(): string {
  const p = platform();
  if (p === 'macos') return 'mac';
  if (p === 'windows') return 'windows';
  return 'linux';
}

function getArch(): string {
  const a = arch();
  if (a === 'aarch64') return 'aarch64';
  return 'x64';
}

/**
 * Delete an installed Java version by major version number.
 */
export async function deleteJava(majorVersion: number): Promise<void> {
  const versions = await getJavaVersions();
  const target = versions.find((v) => v.version === majorVersion);
  if (target) {
    try {
      await remove(target.path, { recursive: true });
    } catch {
      /* ignore */
    }
    await saveJavaVersions(versions.filter((v) => v.version !== majorVersion));
  }
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
  callback: (data: { progress: number }) => void
): Promise<UnlistenFn> {
  return tauriListen('java-download-progress', callback);
}
