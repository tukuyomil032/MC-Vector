import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { arch, platform } from '@tauri-apps/plugin-os';
import { type Update, check } from '@tauri-apps/plugin-updater';
import { getTranslation } from '../i18n';
import { getAppSettings } from './config-commands';
import { logError } from './error-utils';
import { tauriInvoke } from './tauri-api';
import {
  DEFAULT_UPDATE_CHANNEL,
  normalizeUpdateChannel,
  type UpdateChannel,
} from '../store/settingsStore';

export type { UpdateChannel } from '../store/settingsStore';

interface PendingUpdate {
  update: Update;
  channel: UpdateChannel;
  target: string;
  generation: number;
}

let currentUpdate: PendingUpdate | null = null;
let updateGeneration = 0;

export function getUpdateTarget(channel: UpdateChannel, os: string, architecture: string): string {
  const platformId = os === 'macos' ? 'darwin' : os === 'windows' ? 'windows' : null;
  if (!platformId) {
    throw new Error(`Unsupported update platform: ${os}`);
  }
  if (platformId === 'darwin' && !['aarch64', 'x86_64'].includes(architecture)) {
    throw new Error(`Unsupported update architecture: ${architecture}`);
  }
  if (platformId === 'windows' && architecture !== 'x86_64') {
    throw new Error(`Unsupported update architecture: ${architecture}`);
  }
  return `${channel}-${platformId}-${architecture}`;
}

async function getSavedUpdateChannel(): Promise<UpdateChannel> {
  try {
    return normalizeUpdateChannel((await getAppSettings()).updateChannel);
  } catch (error) {
    logError('Failed to load update channel; using stable', error);
    return DEFAULT_UPDATE_CHANNEL;
  }
}

async function getCurrentUpdateTarget(channel: UpdateChannel): Promise<string> {
  return getUpdateTarget(channel, await platform(), await arch());
}

export function clearPendingUpdate(): void {
  currentUpdate = null;
  updateGeneration += 1;
}

async function ensurePendingUpdateIsCurrent(pending: PendingUpdate): Promise<void> {
  const currentChannel = await getSavedUpdateChannel();
  if (pending.generation === updateGeneration && pending.channel === currentChannel) {
    return;
  }

  if (currentUpdate === pending) {
    clearPendingUpdate();
  }
  try {
    await pending.update.close();
  } catch (error) {
    logError('Failed to close stale update candidate', error);
  }
  throw new Error('Update channel changed. Check for updates again.');
}

interface UpdateCheckResult {
  can_update: boolean;
  reason?: string;
}

function normalizeUpdaterError(error: unknown): string {
  const t = getTranslation();
  const raw = String(error);
  const lower = raw.toLowerCase();

  if (lower.includes('signature verification failed')) {
    return `${t('errors.updateSignatureVerificationFailed')}\n${t('errors.updateSignatureVerificationDetails', { error: raw })}`;
  }

  return raw;
}

function createReadOnlyErrorMessage(location: string): string {
  const t = getTranslation();
  return `${t('errors.updateReadOnlyLocationTitle')}\n\n${t('errors.updateReadOnlyLocationCurrent', { location })}\n\n${t('errors.updateReadOnlyLocationSteps')}\n${t('errors.updateReadOnlyLocationStep1')}\n${t('errors.updateReadOnlyLocationStep2')}\n${t('errors.updateReadOnlyLocationStep3')}\n${t('errors.updateReadOnlyLocationStep4')}\n\nThe app is running from a read-only location.\n\nCurrent location: ${location}\n\nTo apply the update:\n1. Quit this app\n2. Drag and drop the app to the Applications folder in Finder\n3. Launch the app again from the Applications folder\n4. Try updating again`;
}

function createPermissionErrorMessage(location: string): string {
  const t = getTranslation();
  return `${t('errors.updatePermissionDeniedTitle')}\n\n${t('errors.updatePermissionDeniedCurrent', { location })}\n\n${t('errors.updatePermissionDeniedSteps')}\n${t('errors.updatePermissionDeniedStep1')}\n${t('errors.updatePermissionDeniedStep2')}\n${t('errors.updatePermissionDeniedStep3')}\n${t('errors.updatePermissionDeniedStep4')}\n\nThe app does not have the necessary permissions to update.\n\nCurrent location: ${location}\n\nTo apply the update:\n1. Quit this app\n2. Move the app to the Applications folder in Finder\n3. Check the folder permissions\n4. Try updating again`;
}

function createAppTranslocatedErrorMessage(location: string): string {
  const t = getTranslation();
  return `${t('errors.updateAppTranslocatedTitle')}\n\n${t('errors.updateAppTranslocatedCurrent', { location })}\n\n${t('errors.updateAppTranslocatedSteps')}\n${t('errors.updateAppTranslocatedStep1')}\n${t('errors.updateAppTranslocatedStep2')}\n${t('errors.updateAppTranslocatedStep3')}\n${t('errors.updateAppTranslocatedStep4')}`;
}

export async function checkForUpdates(): Promise<{
  available: boolean;
  version?: string;
  body?: string;
  error?: string;
}> {
  const generation = updateGeneration;
  try {
    const channel = await getSavedUpdateChannel();
    const target = await getCurrentUpdateTarget(channel);
    if (generation !== updateGeneration) {
      return { available: false };
    }

    const update = await check({ target });
    if (generation !== updateGeneration) {
      if (update) {
        try {
          await update.close();
        } catch (error) {
          logError('Failed to close stale update candidate', error);
        }
      }
      return { available: false };
    }
    if (update) {
      currentUpdate = { update, channel, target, generation };
      return {
        available: true,
        version: update.version,
        body: update.body ?? undefined,
      };
    }
    return { available: false };
  } catch (e) {
    logError('Update check failed', e);
    return { available: false, error: normalizeUpdaterError(e) };
  }
}

export async function canUpdateApp(): Promise<UpdateCheckResult> {
  try {
    return await tauriInvoke<UpdateCheckResult>('can_update_app');
  } catch (e) {
    logError('Failed to check if app can update', e);
    return { can_update: false, reason: 'check_failed' };
  }
}

export async function getAppLocation(): Promise<string> {
  try {
    return await tauriInvoke<string>('get_app_location');
  } catch (e) {
    logError('Failed to get app location', e);
    return 'Unknown';
  }
}

export async function downloadAndInstallUpdate(
  onProgress?: (downloaded: number, total: number) => void,
): Promise<void> {
  let pending = currentUpdate;
  if (!pending) {
    const result = await checkForUpdates();
    pending = currentUpdate;
    if (!result.available || !pending) {
      throw new Error('No update available');
    }
  }

  await ensurePendingUpdateIsCurrent(pending);

  // Check if the app can be updated before proceeding
  const updateCheck = await canUpdateApp();
  if (!updateCheck.can_update) {
    const t = getTranslation();
    const location = await getAppLocation();
    if (updateCheck.reason === 'app_translocated') {
      throw new Error(createAppTranslocatedErrorMessage(location));
    }
    // Only show read-only specific message for read-only filesystem errors
    if (updateCheck.reason === 'read_only') {
      throw new Error(createReadOnlyErrorMessage(location));
    }
    if (updateCheck.reason === 'permission_denied') {
      throw new Error(createPermissionErrorMessage(location));
    }
    // Generic error for other cases
    throw new Error(
      `${t('errors.updateCannotApply')}\n\nCannot apply update. Please move the app to the Applications folder and try again.`,
    );
  }

  let downloaded = 0;
  let contentLength = 0;

  const downloadWithProgress = async () => {
    downloaded = 0;
    contentLength = 0;

    await pending.update.download((event) => {
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
    await ensurePendingUpdateIsCurrent(pending);
    await downloadWithProgress();
    await ensurePendingUpdateIsCurrent(pending);
    await pending.update.install();

    await relaunch();
  } catch (error) {
    // Handle update errors with user-friendly details
    const errorMessage = String(error);
    if (errorMessage.includes('Read-only file system') || errorMessage.includes('os error 30')) {
      const location = await getAppLocation();
      throw new Error(createReadOnlyErrorMessage(location));
    }

    throw new Error(normalizeUpdaterError(error));
  }
}

export async function getAppVersion(): Promise<string> {
  return getVersion();
}
