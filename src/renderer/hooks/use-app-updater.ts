import { useCallback, useEffect, useRef, useState } from 'react';
import { getTranslation } from '../../i18n';
import {
  getUpdatePromptPreferences,
  saveUpdatePromptPreferences,
  type UpdatePromptPreferences,
} from '../../lib/config-commands';
import { logError, toErrorMessage } from '../../lib/error-utils';
import { notify } from '../shared/notify';
import {
  checkForUpdates,
  clearPendingUpdate,
  downloadAndInstallUpdate,
  restartToApplyUpdate,
} from '../../lib/update-commands';

/** One toast id for the whole download, so progress updates in place and finishes as a single result. */
const UPDATE_TOAST_ID = 'app-update';

/** Relaunches for an installed update. Failures become a toast, because the modal may already be closed. */
async function restartForUpdate(): Promise<void> {
  try {
    await restartToApplyUpdate();
  } catch (error) {
    logError('Restart to apply update failed', error);
    notify.error(getTranslation()('settings.update.errorTitle'), toErrorMessage(error));
  }
}

const REMIND_LATER_MS = 24 * 60 * 60 * 1000;

/** Whether the prompt for this version may open. A skipped version never opens; a postponed one waits out its 24 hours. */
async function isUpdatePromptDue(version: string | undefined): Promise<boolean> {
  if (!version) return true;
  try {
    const preferences = await getUpdatePromptPreferences();
    if (preferences.skippedVersion === version) return false;
    const reminder = preferences.remindLater;
    return !(reminder && reminder.version === version && Date.now() < reminder.until);
  } catch (error) {
    logError('Failed to read update prompt preferences', error);
    return true;
  }
}

async function rememberUpdatePrompt(
  change: (preferences: UpdatePromptPreferences) => UpdatePromptPreferences,
): Promise<void> {
  try {
    const current = await getUpdatePromptPreferences();
    await saveUpdatePromptPreferences(change(current));
  } catch (error) {
    logError('Failed to save update prompt preferences', error);
  }
}

export interface UpdatePromptState {
  version?: string;
  releaseNotes?: unknown;
}

export type UpdateCheckStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'error';

export interface AppUpdaterSettings {
  onCheckForUpdates: () => Promise<void>;
  updateCheckStatus: UpdateCheckStatus;
  updateCheckError: string | null;
  updatePrompt: UpdatePromptState | null;
  updateProgress: number | null;
}

export function useAppUpdater() {
  const [updatePrompt, setUpdatePrompt] = useState<UpdatePromptState | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<UpdateCheckStatus>('idle');
  const [updateCheckError, setUpdateCheckError] = useState<string | null>(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const isUpdatingRef = useRef(false);
  const checkPromiseRef = useRef<Promise<void> | null>(null);
  const queuedCheckRef = useRef(false);
  // True once the update is installed and only the restart remains. Progress is cleared at the same time,
  // so the modal never sits at 100% waiting for a state that never arrives.
  const [updateReady, setUpdateReady] = useState(false);

  const handleCheckForUpdates = useCallback(() => {
    if (checkPromiseRef.current) {
      queuedCheckRef.current = true;
      return checkPromiseRef.current;
    }

    const checkPromise = (async () => {
      do {
        queuedCheckRef.current = false;
        setUpdateCheckStatus('checking');
        setUpdateCheckError(null);

        let result: Awaited<ReturnType<typeof checkForUpdates>>;
        try {
          result = await checkForUpdates();
        } catch (error) {
          logError('Update check failed', error);
          result = { available: false, error: toErrorMessage(error) };
        }

        // A channel change can invalidate a check already in flight. Ignore its
        // result and run one more check against the newly persisted channel.
        if (queuedCheckRef.current) continue;

        if (result.available) {
          setUpdatePrompt({ version: result.version, releaseNotes: result.body });
          setUpdateError(null);
          setUpdateCheckStatus('available');
          setUpdateModalOpen(await isUpdatePromptDue(result.version));
          return;
        }

        setUpdatePrompt(null);
        if (result.error) {
          logError('Update check failed', result.error);
          setUpdateCheckError(result.error);
          setUpdateCheckStatus('error');
          return;
        }

        setUpdateCheckStatus('not-available');
      } while (queuedCheckRef.current);
    })();

    checkPromiseRef.current = checkPromise.finally(() => {
      checkPromiseRef.current = null;
    });
    return checkPromiseRef.current;
  }, []);

  useEffect(() => {
    void handleCheckForUpdates();

    const handleChannelChanged = () => {
      clearPendingUpdate();
      setUpdatePrompt(null);
      setUpdateProgress(null);
      setUpdateError(null);
      setUpdateCheckError(null);
      setUpdateModalOpen(false);
      setUpdateReady(false);
      void handleCheckForUpdates();
    };
    window.addEventListener('mc-vector:update-channel-changed', handleChannelChanged);
    return () =>
      window.removeEventListener('mc-vector:update-channel-changed', handleChannelChanged);
  }, [handleCheckForUpdates]);

  const handleUpdateNow = useCallback(async () => {
    if (isUpdatingRef.current) {
      return;
    }
    isUpdatingRef.current = true;
    setUpdateProgress(0);
    const tr = getTranslation();
    const downloadingTitle = tr('settings.update.downloadingTitle');
    notify.progress(UPDATE_TOAST_ID, { title: downloadingTitle, progress: 0 });
    try {
      await downloadAndInstallUpdate((downloaded, total) => {
        const percentage = total > 0 ? (downloaded / total) * 100 : 0;
        setUpdateProgress(percentage);
        notify.progress(UPDATE_TOAST_ID, { title: downloadingTitle, progress: percentage });
      });
      setUpdateError(null);
      setUpdateProgress(null);
      setUpdateReady(true);
      // The finished toast carries the restart, so the update can be applied after the modal has closed.
      notify.done(UPDATE_TOAST_ID, {
        type: 'success',
        title: tr('settings.update.readyTitle'),
        description: tr('settings.update.downloaded'),
        action: { label: tr('settings.update.restart'), onClick: () => void restartForUpdate() },
      });
    } catch (error) {
      logError('Update installation failed', error);
      notify.dismiss(UPDATE_TOAST_ID);
      setUpdateError(toErrorMessage(error));
      setUpdateProgress(null);
      setUpdateModalOpen(true);
    } finally {
      isUpdatingRef.current = false;
    }
  }, []);

  const handleInstallUpdate = useCallback(() => restartForUpdate(), []);

  const handleDismissUpdate = useCallback(() => {
    setUpdateModalOpen(false);
    // Closing an update that has not started yet means "later": this version waits 24 hours.
    const version = updatePrompt?.version;
    if (version && !isUpdatingRef.current && !updateReady && !updateError) {
      void rememberUpdatePrompt((preferences) => ({
        ...preferences,
        remindLater: { version, until: Date.now() + REMIND_LATER_MS },
      }));
    }
  }, [updatePrompt, updateReady, updateError]);

  const handleSkipUpdateVersion = useCallback(() => {
    const version = updatePrompt?.version;
    setUpdateModalOpen(false);
    if (!version) return;
    void rememberUpdatePrompt(() => ({ skippedVersion: version }));
  }, [updatePrompt]);

  return {
    updateModalOpen,
    updatePrompt,
    updateProgress,
    updateError,
    updateCheckStatus,
    updateCheckError,
    updateReady,
    handleCheckForUpdates,
    handleUpdateNow,
    handleInstallUpdate,
    handleDismissUpdate,
    handleSkipUpdateVersion,
  };
}
