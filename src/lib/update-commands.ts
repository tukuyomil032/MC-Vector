import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getTranslation } from '../i18n';
import { tauriInvoke } from './tauri-api';

let currentUpdate: Update | null = null;

interface UpdateCheckResult {
  can_update: boolean;
  reason?: string;
}

function normalizeUpdaterError(error: unknown): string {
  const t = getTranslation();
  const raw = String(error);
  const lower = raw.toLowerCase();

  if (lower.includes('signature verification failed')) {
    return (
      t('errors.updateSignatureVerificationFailed') +
      '\n' +
      t('errors.updateSignatureVerificationDetails', { error: raw })
    );
  }

  return raw;
}

function createReadOnlyErrorMessage(location: string): string {
  const t = getTranslation();
  return (
    `${t('errors.updateReadOnlyLocationTitle')}\n\n` +
    `${t('errors.updateReadOnlyLocationCurrent', { location })}\n\n` +
    `${t('errors.updateReadOnlyLocationSteps')}\n` +
    `${t('errors.updateReadOnlyLocationStep1')}\n` +
    `${t('errors.updateReadOnlyLocationStep2')}\n` +
    `${t('errors.updateReadOnlyLocationStep3')}\n` +
    `${t('errors.updateReadOnlyLocationStep4')}\n\n` +
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
  const t = getTranslation();
  return (
    `${t('errors.updatePermissionDeniedTitle')}\n\n` +
    `${t('errors.updatePermissionDeniedCurrent', { location })}\n\n` +
    `${t('errors.updatePermissionDeniedSteps')}\n` +
    `${t('errors.updatePermissionDeniedStep1')}\n` +
    `${t('errors.updatePermissionDeniedStep2')}\n` +
    `${t('errors.updatePermissionDeniedStep3')}\n` +
    `${t('errors.updatePermissionDeniedStep4')}\n\n` +
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
  error?: string;
}> {
  try {
    const update = await check();
    if (update) {
      currentUpdate = update;
      return {
        available: true,
        version: update.version,
        body: update.body ?? undefined,
      };
    }
    return { available: false };
  } catch (e) {
    console.error('Update check failed:', e);
    return { available: false, error: normalizeUpdaterError(e) };
  }
}

export async function canUpdateApp(): Promise<UpdateCheckResult> {
  try {
    return await tauriInvoke<UpdateCheckResult>('can_update_app');
  } catch (e) {
    console.error('Failed to check if app can update:', e);
    // Return a safe default when the check itself fails, allowing the update
    // to proceed and potentially fail with a more specific error later
    return { can_update: true };
  }
}

export async function getAppLocation(): Promise<string> {
  try {
    return await tauriInvoke<string>('get_app_location');
  } catch (e) {
    console.error('Failed to get app location:', e);
    return 'Unknown';
  }
}

export async function downloadAndInstallUpdate(
  onProgress?: (downloaded: number, total: number) => void,
): Promise<void> {
  const latestUpdate = await check();
  if (latestUpdate) {
    currentUpdate = latestUpdate;
  }

  if (!currentUpdate) throw new Error('No update available');

  // Check if the app can be updated before proceeding
  const updateCheck = await canUpdateApp();
  if (!updateCheck.can_update) {
    const t = getTranslation();
    const location = await getAppLocation();
    // Only show read-only specific message for read-only filesystem errors
    if (updateCheck.reason === 'read_only') {
      throw new Error(createReadOnlyErrorMessage(location));
    } else if (updateCheck.reason === 'permission_denied') {
      throw new Error(createPermissionErrorMessage(location));
    } else {
      // Generic error for other cases
      throw new Error(
        `${t('errors.updateCannotApply')}\n\n` +
          `Cannot apply update. Please move the app to the Applications folder and try again.`,
      );
    }
  }

  let downloaded = 0;
  let contentLength = 0;

  const installWithProgress = async () => {
    downloaded = 0;
    contentLength = 0;

    await currentUpdate!.downloadAndInstall((event) => {
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
  };

  try {
    await installWithProgress();

    await relaunch();
  } catch (error) {
    // Handle update errors with user-friendly details
    const errorMessage = String(error);
    if (errorMessage.includes('Read-only file system') || errorMessage.includes('os error 30')) {
      const location = await getAppLocation();
      throw new Error(createReadOnlyErrorMessage(location));
    }

    if (errorMessage.toLowerCase().includes('signature verification failed')) {
      const refreshed = await check();
      if (refreshed) {
        currentUpdate = refreshed;
        await installWithProgress();
        await relaunch();
        return;
      }
    }

    throw new Error(normalizeUpdaterError(error));
  }
}

export async function getAppVersion(): Promise<string> {
  return getVersion();
}
