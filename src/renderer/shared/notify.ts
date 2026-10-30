import type { ToastStackApi } from '@/components/arc/toast-stack/toast-stack';

/**
 * Module-level bridge to the toast stack. `NotifyBridge` registers the stack on mount, so code outside React
 * (hooks, event listeners, plain helpers) can show toasts without a context. Calls made before the stack mounts are dropped.
 */
let bridge: ToastStackApi | null = null;
/** Last percentage and title shown per progress key, so repeated events with the same value do not re-render the stack. */
const lastProgress = new Map<string, { percent: number; title: string }>();

export function registerNotifyBridge(api: ToastStackApi | null): void {
  bridge = api;
  if (!api) lastProgress.clear();
}

export type NotifyDoneType = 'success' | 'error' | 'warning' | 'info';

export interface NotifyProgressOptions {
  title: string;
  /** Completion from 0 to 100. Values outside the range are clamped. */
  progress: number;
}

export interface NotifyDoneOptions {
  type: NotifyDoneType;
  title: string;
  description?: string;
}

const clampPercent = (value: number) =>
  Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : 0;

function show(type: NotifyDoneType, title: string, description?: string): string | undefined {
  return bridge?.toast({ type, title, description });
}

export const notify = {
  success: (title: string, description?: string) => show('success', title, description),
  error: (title: string, description?: string) => show('error', title, description),
  warning: (title: string, description?: string) => show('warning', title, description),
  info: (title: string, description?: string) => show('info', title, description),

  /** Creates the progress toast for `key`, or updates it in place. The key is the toast id, so one task keeps one toast. */
  progress(key: string, { title, progress }: NotifyProgressOptions): string | undefined {
    const percent = clampPercent(progress);
    const last = lastProgress.get(key);
    if (last && last.percent === percent && last.title === title) return key;
    lastProgress.set(key, { percent, title });
    return bridge?.toast({
      id: key,
      type: 'loading',
      title,
      progress: percent,
      duration: Infinity,
    });
  },

  /** Replaces the progress toast for `key` with its final result. The bar goes away because the type is no longer loading. */
  done(key: string, { type, title, description }: NotifyDoneOptions): string | undefined {
    lastProgress.delete(key);
    return bridge?.toast({ id: key, type, title, description, progress: undefined });
  },

  dismiss(key: string): void {
    lastProgress.delete(key);
    bridge?.dismiss(key);
  },
};
