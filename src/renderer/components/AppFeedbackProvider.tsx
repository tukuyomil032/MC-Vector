import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Toaster, toast } from 'sonner';
import { useTranslation } from '../../i18n';
import { logError } from '../../lib/error-utils';
import type {
  FeedbackDialogAction,
  FeedbackDialogRequest,
  FeedbackNotificationKind,
  FeedbackSeverity,
} from '../shared/feedback';
import { Button } from './ui/Button';

export interface AppFeedbackApi {
  notifySuccess: (message: string) => void;
  notifyInfo: (message: string) => void;
  notifyError: (message: string) => void;
  notify: (message: string, kind?: FeedbackNotificationKind) => void;
  openDialog: (request: FeedbackDialogRequest) => Promise<void>;
}

const AppFeedbackContext = createContext<AppFeedbackApi | null>(null);

interface FeedbackDialogState extends FeedbackDialogRequest {
  id: number;
}

function severityIcon(severity: FeedbackSeverity) {
  if (severity === 'error') {
    return <AlertCircle size={20} aria-hidden="true" className="text-red-300" />;
  }
  if (severity === 'warning') {
    return <AlertTriangle size={20} aria-hidden="true" className="text-amber-300" />;
  }
  return <Info size={20} aria-hidden="true" className="text-sky-300" />;
}

function FeedbackActionButton({
  action,
  variant,
  disabled,
  onSelect,
}: {
  action: FeedbackDialogAction;
  variant: 'primary' | 'secondary';
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant={variant === 'primary' ? 'modalPrimary' : 'modalSecondary'}
      disabled={disabled}
      onClick={onSelect}
    >
      {action.label}
    </Button>
  );
}

function FeedbackDialogContent({
  dialog,
  actionPending,
  closeLabel,
  onClose,
  onAction,
}: {
  dialog: FeedbackDialogState;
  actionPending: boolean;
  closeLabel: string;
  onClose: () => void;
  onAction: (action: FeedbackDialogAction) => void;
}) {
  return (
    <Dialog.Content
      data-testid="feedback-dialog"
      className="mc-modal-panel fixed left-1/2 top-1/2 z-[1001] max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
      onEscapeKeyDown={dialog.dismissible === false ? (event) => event.preventDefault() : undefined}
      onPointerDownOutside={
        dialog.dismissible === false ? (event) => event.preventDefault() : undefined
      }
    >
      <div className="mb-4 flex items-start gap-3">
        <div aria-hidden="true" className="mt-0.5 shrink-0">
          {severityIcon(dialog.severity)}
        </div>
        <div className="min-w-0 flex-1">
          <Dialog.Title className="mt-0 mb-5 text-xl border-b border-zinc-700 pb-2.5 mb-2 border-0 pb-0 pr-8">
            {dialog.title}
          </Dialog.Title>
          <Dialog.Description className="whitespace-pre-line text-sm leading-6 text-zinc-300">
            {dialog.description}
          </Dialog.Description>
        </div>
        <Dialog.Close asChild>
          <button
            type="button"
            className="absolute right-4 top-4 rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={closeLabel}
            disabled={actionPending}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </Dialog.Close>
      </div>

      <div className="flex justify-end gap-2.5 mt-2.5">
        {dialog.primaryAction ? (
          <Dialog.Close asChild>
            <Button
              type="button"
              variant="modalSecondary"
              disabled={actionPending}
              onClick={onClose}
            >
              {closeLabel}
            </Button>
          </Dialog.Close>
        ) : null}
        {dialog.secondaryAction ? (
          <FeedbackActionButton
            action={dialog.secondaryAction}
            variant="secondary"
            disabled={actionPending}
            onSelect={() => onAction(dialog.secondaryAction as FeedbackDialogAction)}
          />
        ) : null}
        {dialog.primaryAction ? (
          <FeedbackActionButton
            action={dialog.primaryAction}
            variant="primary"
            disabled={actionPending}
            onSelect={() => onAction(dialog.primaryAction as FeedbackDialogAction)}
          />
        ) : (
          <Dialog.Close asChild>
            <Button type="button" variant="modalPrimary" disabled={actionPending} onClick={onClose}>
              {closeLabel}
            </Button>
          </Dialog.Close>
        )}
      </div>
    </Dialog.Content>
  );
}

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<FeedbackDialogState | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const nextDialogId = useRef(0);
  const resolverRef = useRef<(() => void) | null>(null);

  const closeDialog = useCallback(() => {
    resolverRef.current?.();
    resolverRef.current = null;
    setActionPending(false);
    setDialog(null);
  }, []);

  const openDialog = useCallback((request: FeedbackDialogRequest) => {
    return new Promise<void>((resolve) => {
      resolverRef.current?.();
      resolverRef.current = resolve;
      nextDialogId.current += 1;
      setActionPending(false);
      setDialog({ ...request, id: nextDialogId.current });
    });
  }, []);

  const onAction = useCallback(
    (action: FeedbackDialogAction) => {
      setActionPending(true);
      Promise.resolve()
        .then(() => action.onSelect?.())
        .then(closeDialog)
        .catch((error) => {
          logError('Feedback dialog action failed', error);
          setActionPending(false);
        });
    },
    [closeDialog],
  );

  const notify = useCallback((message: string, kind: FeedbackNotificationKind = 'info') => {
    if (kind === 'success') {
      toast.success(message);
    } else if (kind === 'error') {
      toast.error(message);
    } else if (kind === 'warning') {
      toast.warning(message);
    } else {
      toast(message);
    }
  }, []);

  const notifySuccess = useCallback((message: string) => notify(message, 'success'), [notify]);
  const notifyInfo = useCallback((message: string) => notify(message, 'info'), [notify]);
  const notifyError = useCallback((message: string) => notify(message, 'error'), [notify]);
  const value = useMemo<AppFeedbackApi>(
    () => ({ notifySuccess, notifyInfo, notifyError, notify, openDialog }),
    [notify, notifyError, notifyInfo, notifySuccess, openDialog],
  );

  return (
    <AppFeedbackContext.Provider value={value}>
      {children}
      <Toaster position="bottom-right" richColors />
      <Dialog.Root open={dialog !== null} onOpenChange={(open) => !open && closeDialog()}>
        <Dialog.Portal>
          <Dialog.Overlay className="mc-modal-overlay" />
          {dialog ? (
            <FeedbackDialogContent
              key={dialog.id}
              dialog={dialog}
              actionPending={actionPending}
              closeLabel={t('common.close')}
              onClose={closeDialog}
              onAction={onAction}
            />
          ) : null}
        </Dialog.Portal>
      </Dialog.Root>
    </AppFeedbackContext.Provider>
  );
}

export function useAppFeedback(): AppFeedbackApi {
  const context = useContext(AppFeedbackContext);
  if (!context) {
    throw new Error('useAppFeedback must be used within AppFeedbackProvider');
  }
  return context;
}
