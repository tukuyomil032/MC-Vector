import { useCallback, useEffect, useRef, useState } from 'react';
import { logError, toErrorMessage } from '../../lib/error-utils';
import { checkForUpdates, downloadAndInstallUpdate } from '../../lib/update-commands';

export interface UpdatePromptState {
  version?: string;
  releaseNotes?: unknown;
}

export function useAppUpdater() {
  const [updatePrompt, setUpdatePrompt] = useState<UpdatePromptState | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const isUpdatingRef = useRef(false);
  const updateReady = false;

  useEffect(() => {
    const doUpdateCheck = async () => {
      try {
        const result = await checkForUpdates();
        if (result.available) {
          setUpdatePrompt({ version: result.version, releaseNotes: result.body });
          setUpdateError(null);
          return;
        }
        if (result.error) {
          setUpdateError(result.error);
          return;
        }
        setUpdateError(null);
      } catch (error) {
        logError('Update check failed', error);
        setUpdateError(toErrorMessage(error));
      }
    };
    void doUpdateCheck();
  }, []);

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
    } finally {
      isUpdatingRef.current = false;
    }
  }, []);

  const handleInstallUpdate = handleUpdateNow;

  const handleDismissUpdate = useCallback(() => {
    setUpdatePrompt(null);
    setUpdateProgress(null);
    setUpdateError(null);
  }, []);

  return {
    updatePrompt,
    updateProgress,
    updateError,
    updateReady,
    handleUpdateNow,
    handleInstallUpdate,
    handleDismissUpdate,
  };
}
