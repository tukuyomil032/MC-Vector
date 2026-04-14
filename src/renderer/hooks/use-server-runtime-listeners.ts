import { useEffect, useRef } from 'react';
import { onNgrokStatusChange } from '../../lib/ngrok-commands';
import {
  getServers,
  onDownloadProgress,
  onServerLog,
  onServerStatusChange,
} from '../../lib/server-commands';
import type { ToastKind } from '../components/ToastProvider';
import type { MinecraftServer } from '../shared/server declaration';

type Translate = (key: string, values?: Record<string, unknown>) => string;
type SetServers = (
  nextServers: MinecraftServer[] | ((prevServers: MinecraftServer[]) => MinecraftServer[]),
) => void;
type SetDownloadStatus = (status: { id: string; progress: number; msg: string } | null) => void;
type SetNgrokData = (
  updater: (prevData: Record<string, string | null>) => Record<string, string | null>,
) => void;

interface ServerStatusChangeData {
  serverId: string;
  status: MinecraftServer['status'];
}

interface UseServerRuntimeListenersOptions {
  selectedServerId: string;
  setSelectedServerId: (serverId: string) => void;
  setServers: SetServers;
  loadTemplates: () => Promise<void>;
  appendServerLog: (serverId: string, line: string) => void;
  showToast: (message: string, type?: ToastKind) => void;
  t: Translate;
  setDownloadStatus: SetDownloadStatus;
  setNgrokData: SetNgrokData;
  handleServerStatusChange: (data: ServerStatusChangeData) => void;
}

const SERVER_STATUS_VALUES: readonly MinecraftServer['status'][] = [
  'online',
  'offline',
  'starting',
  'stopping',
  'restarting',
  'crashed',
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isServerStatus(value: unknown): value is MinecraftServer['status'] {
  return (
    typeof value === 'string' &&
    SERVER_STATUS_VALUES.some((allowedStatus) => allowedStatus === value)
  );
}

export function useServerRuntimeListeners({
  selectedServerId,
  setSelectedServerId,
  setServers,
  loadTemplates,
  appendServerLog,
  showToast,
  t,
  setDownloadStatus,
  setNgrokData,
  handleServerStatusChange,
}: UseServerRuntimeListenersOptions) {
  // Keep a ref that always holds the latest prop values so the subscription
  // effect can run exactly once while still reading up-to-date callbacks.
  const latestProps: UseServerRuntimeListenersOptions = {
    selectedServerId,
    setSelectedServerId,
    setServers,
    loadTemplates,
    appendServerLog,
    showToast,
    t,
    setDownloadStatus,
    setNgrokData,
    handleServerStatusChange,
  };
  const propsRef = useRef(latestProps);
  propsRef.current = latestProps;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const loadServers = async () => {
      const { setServers, loadTemplates, selectedServerId, setSelectedServerId, showToast, t } =
        propsRef.current;
      try {
        const loadedServers = await getServers();
        setServers(loadedServers);
        await loadTemplates();
        if (loadedServers.length > 0 && !selectedServerId) {
          setSelectedServerId(loadedServers[0].id);
        }
      } catch {
        showToast(t('server.toast.loadError'), 'error');
      }
    };
    void loadServers();

    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const setupListeners = async () => {
      const disposeServerLog = await onServerLog((data) => {
        if (cancelled) {
          return;
        }
        if (!data || !data.serverId) {
          return;
        }
        const formattedLog = data.line.replace(/\n/g, '\r\n');
        propsRef.current.appendServerLog(data.serverId, formattedLog);
      });
      unlisteners.push(disposeServerLog);

      const disposeDownloadProgress = await onDownloadProgress((data) => {
        if (cancelled) {
          return;
        }
        const { setDownloadStatus, showToast, t } = propsRef.current;
        if (data.progress === 100) {
          setDownloadStatus(null);
          showToast(t('server.toast.downloadComplete', { status: data.status }), 'success');
        } else {
          setDownloadStatus({ id: data.serverId, progress: data.progress, msg: data.status });
        }
      });
      unlisteners.push(disposeDownloadProgress);

      const disposeServerStatus = await onServerStatusChange((data) => {
        if (cancelled) {
          return;
        }
        if (!isNonEmptyString(data.serverId) || !isServerStatus(data.status)) {
          return;
        }
        const serverId = data.serverId.trim();
        propsRef.current.handleServerStatusChange({ serverId, status: data.status });
      });
      unlisteners.push(disposeServerStatus);

      const disposeNgrokStatus = await onNgrokStatusChange((data) => {
        if (cancelled) {
          return;
        }
        if (!isNonEmptyString(data.serverId)) {
          return;
        }
        const serverId = data.serverId.trim();
        if (data.status === 'stopped' || data.status === 'error') {
          propsRef.current.setNgrokData((prev) => ({ ...prev, [serverId]: null }));
        } else if (isNonEmptyString(data.url)) {
          propsRef.current.setNgrokData((prev) => ({ ...prev, [serverId]: data.url.trim() }));
        }
      });
      unlisteners.push(disposeNgrokStatus);

      if (cancelled) {
        unlisteners.forEach((dispose) => dispose());
      }
    };

    void setupListeners();

    return () => {
      cancelled = true;
      unlisteners.forEach((dispose) => dispose());
    };
  }, []); // intentional: subscriptions are set up once; fresh values are read via propsRef
}
