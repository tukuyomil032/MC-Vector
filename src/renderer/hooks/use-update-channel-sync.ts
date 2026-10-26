import { useEffect } from 'react';
import { getAppSettings, onConfigChange } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';
import { normalizeUpdateChannel, type UpdateChannel } from '../../store/settingsStore';

interface UseUpdateChannelSyncOptions {
  setUpdateChannel: (channel: UpdateChannel) => void;
}

export function useUpdateChannelSync({ setUpdateChannel }: UseUpdateChannelSyncOptions) {
  useEffect(() => {
    const applyUpdateChannel = (value: unknown) => {
      setUpdateChannel(normalizeUpdateChannel(value));
    };

    void getAppSettings()
      .then((settings) => applyUpdateChannel(settings.updateChannel))
      .catch((error) => logError('Failed to load app update channel', error));

    let dispose: (() => void) | undefined;
    void onConfigChange('updateChannel', (value) => applyUpdateChannel(value)).then((cleanup) => {
      dispose = cleanup;
    });

    return () => dispose?.();
  }, [setUpdateChannel]);
}
