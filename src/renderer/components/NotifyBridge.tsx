import { useEffect } from 'react';
import { useToastStack } from '@/components/arc/toast-stack/toast-stack';
import { registerNotifyBridge } from '../shared/notify';

/** Connects the module-level `notify` helpers to the toast stack above it. Mount once, inside `ToastStackProvider`. */
export function NotifyBridge() {
  const { toast, update, dismiss } = useToastStack();

  useEffect(() => {
    registerNotifyBridge({ toast, update, dismiss });
    return () => registerNotifyBridge(null);
  }, [toast, update, dismiss]);

  return null;
}
