import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

let currentUpdate: Update | null = null;

export async function checkForUpdates(): Promise<{
  available: boolean;
  version?: string;
  body?: string;
}> {
  try {
    const update = await check();
    if (update) {
      currentUpdate = update;
      return { available: true, version: update.version, body: update.body ?? undefined };
    }
    return { available: false };
  } catch (e) {
    console.error('Update check failed:', e);
    return { available: false };
  }
}

export async function downloadAndInstallUpdate(
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  if (!currentUpdate) throw new Error('No update available');

  let downloaded = 0;
  let contentLength = 0;

  await currentUpdate.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength ?? 0;
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, contentLength);
        break;
      case 'Finished':
        break;
    }
  });

  await relaunch();
}

export async function getAppVersion(): Promise<string> {
  return getVersion();
}
