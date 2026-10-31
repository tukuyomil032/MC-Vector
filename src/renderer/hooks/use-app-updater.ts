import { useCallback, useEffect, useRef, useState } from 'react';
import { logError, toErrorMessage } from '../../lib/error-utils';
import {
  checkForUpdates,
  clearPendingUpdate,
  downloadAndInstallUpdate,
} from '../../lib/update-commands';

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
  const updateReady = false;

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
          setUpdateModalOpen(true);
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
    try {
      await downloadAndInstallUpdate((downloaded, total) => {
        const percentage = total > 0 ? (downloaded / total) * 100 : 0;
        setUpdateProgress(percentage);
      });
      setUpdateError(null);
    } catch (error) {
      logError('Update installation failed', error);
      setUpdateError(toErrorMessage(error));
      setUpdateProgress(null);
      setUpdateModalOpen(true);
    } finally {
      isUpdatingRef.current = false;
    }
  }, []);

  const handleInstallUpdate = handleUpdateNow;

  const handleDismissUpdate = useCallback(() => {
    setUpdateModalOpen(false);
  }, []);

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
  };
}
