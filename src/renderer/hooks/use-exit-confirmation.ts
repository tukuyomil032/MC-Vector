import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef } from 'react';
import type { Translate } from '../../i18n';
import { logError } from '../../lib/error-utils';

export interface ExitConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

interface UseExitConfirmationOptions {
  /** Servers whose process may still be alive (any status other than offline or crashed). */
  activeServerCount: number;
  confirm: (options: ExitConfirmOptions) => Promise<boolean>;
  t: Translate;
}

/**
 * Asks before the main window closes while servers are running. Quitting stops every server the app manages,
 * so the request is held until the user confirms. Once confirmed, the window closes without asking again.
 */
export function useExitConfirmation({ activeServerCount, confirm, t }: UseExitConfirmationOptions) {
  const countRef = useRef(activeServerCount);
  const confirmRef = useRef(confirm);
  const tRef = useRef(t);

  useEffect(() => {
    countRef.current = activeServerCount;
    confirmRef.current = confirm;
    tRef.current = t;
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let confirmedClose = false;

    try {
      const appWindow = getCurrentWindow();
      void appWindow
        .onCloseRequested(async (event) => {
          if (confirmedClose || countRef.current === 0) return;
          event.preventDefault();
          const translate = tRef.current;
          const confirmed = await confirmRef.current({
            title: translate('server.exit.title'),
            description: translate('server.exit.description'),
            confirmLabel: translate('server.exit.confirm'),
            cancelLabel: translate('common.cancel'),
            tone: 'danger',
          });
          if (!confirmed) return;
          confirmedClose = true;
          await appWindow.close();
        })
        .then((stop) => {
          if (disposed) {
            stop();
          } else {
            unlisten = stop;
          }
        })
        .catch((error: unknown) => {
          logError('Failed to register the close guard', error);
        });
    } catch (error) {
      // Outside the Tauri shell (plain browser preview) there is no window to guard.
      logError('Close guard is unavailable', error);
    }

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
