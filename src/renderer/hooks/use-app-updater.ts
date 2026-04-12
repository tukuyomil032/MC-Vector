import { useCallback, useEffect, useState } from 'react';
import { checkForUpdates, downloadAndInstallUpdate } from '../../lib/update-commands';

export interface UpdatePromptState {
  version?: string;
  releaseNotes?: unknown;
}

export function useAppUpdater() {
  const [updatePrompt, setUpdatePrompt] = useState<UpdatePromptState | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const doUpdateCheck = async () => {
      try {
        const result = await checkForUpdates();
        if (result.available) {
          setUpdatePrompt({ version: result.version, releaseNotes: result.body });
          setUpdateReady(false);
        }
      } catch (error) {
        console.error('Update check failed', error);
      }
    };
    void doUpdateCheck();
  }, []);

  const handleUpdateNow = useCallback(async () => {
    setUpdateProgress(0);
    try {
      await downloadAndInstallUpdate((downloaded, total) => {
        const percentage = total > 0 ? (downloaded / total) * 100 : 0;
        setUpdateProgress(percentage);
      });
    } catch (error) {
      console.error('Update error', error);
      setUpdateProgress(null);
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    await handleUpdateNow();
  }, [handleUpdateNow]);

  const handleDismissUpdate = useCallback(() => {
    setUpdatePrompt(null);
    setUpdateProgress(null);
    setUpdateReady(false);
  }, []);

  return {
    updatePrompt,
    updateProgress,
    updateReady,
    handleUpdateNow,
    handleInstallUpdate,
    handleDismissUpdate,
  };
}
