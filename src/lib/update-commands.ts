import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';

let currentUpdate: Update | null = null;

interface UpdateCheckResult {
  can_update: boolean;
  reason?: string;
}

function createReadOnlyErrorMessage(location: string): string {
  return (
    `アプリは読み取り専用の場所から実行されています。\n\n` +
    `現在の場所: ${location}\n\n` +
    `アップデートを適用するには：\n` +
    `1. このアプリを終了してください\n` +
    `2. Finderでアプリを「アプリケーション」フォルダにドラッグ&ドロップしてください\n` +
    `3. 「アプリケーション」フォルダから再度起動してください\n` +
    `4. もう一度アップデートを試してください\n\n` +
    `The app is running from a read-only location.\n\n` +
    `Current location: ${location}\n\n` +
    `To apply the update:\n` +
    `1. Quit this app\n` +
    `2. Drag and drop the app to the Applications folder in Finder\n` +
    `3. Launch the app again from the Applications folder\n` +
    `4. Try updating again`
  );
}

function createPermissionErrorMessage(location: string): string {
  return (
    `アプリの更新に必要な権限がありません。\n\n` +
    `現在の場所: ${location}\n\n` +
    `アップデートを適用するには：\n` +
    `1. このアプリを終了してください\n` +
    `2. Finderでアプリを「アプリケーション」フォルダに移動してください\n` +
    `3. フォルダの権限を確認してください\n` +
    `4. もう一度アップデートを試してください\n\n` +
    `The app does not have the necessary permissions to update.\n\n` +
    `Current location: ${location}\n\n` +
    `To apply the update:\n` +
    `1. Quit this app\n` +
    `2. Move the app to the Applications folder in Finder\n` +
    `3. Check the folder permissions\n` +
    `4. Try updating again`
  );
}

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

export async function canUpdateApp(): Promise<UpdateCheckResult> {
  try {
    return await invoke<UpdateCheckResult>('can_update_app');
  } catch (e) {
    console.error('Failed to check if app can update:', e);
    // Return a safe default when the check itself fails, allowing the update
    // to proceed and potentially fail with a more specific error later
    return { can_update: true };
  }
}

export async function getAppLocation(): Promise<string> {
  try {
    return await invoke<string>('get_app_location');
  } catch (e) {
    console.error('Failed to get app location:', e);
    return 'Unknown';
  }
}

export async function downloadAndInstallUpdate(
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  if (!currentUpdate) throw new Error('No update available');

  // Check if the app can be updated before proceeding
  const updateCheck = await canUpdateApp();
  if (!updateCheck.can_update) {
    const location = await getAppLocation();
    // Only show read-only specific message for read-only filesystem errors
    if (updateCheck.reason === 'read_only') {
      throw new Error(createReadOnlyErrorMessage(location));
    } else if (updateCheck.reason === 'permission_denied') {
      throw new Error(createPermissionErrorMessage(location));
    } else {
      // Generic error for other cases
      throw new Error(
        `アップデートを適用できません。アプリを「アプリケーション」フォルダに移動してから再度お試しください。\n\n` +
          `Cannot apply update. Please move the app to the Applications folder and try again.`
      );
    }
  }

  let downloaded = 0;
  let contentLength = 0;

  try {
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
  } catch (error) {
    // Handle the "Read-only file system" error specifically
    const errorMessage = String(error);
    if (errorMessage.includes('Read-only file system') || errorMessage.includes('os error 30')) {
      const location = await getAppLocation();
      throw new Error(createReadOnlyErrorMessage(location));
    }
    throw error;
  }
}

export async function getAppVersion(): Promise<string> {
  return getVersion();
}
