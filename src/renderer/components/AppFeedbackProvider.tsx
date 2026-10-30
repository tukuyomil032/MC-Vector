import {
  type FormEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Input } from '@/components/arc/input/input';
import { useTranslation } from '../../i18n';
import { logError } from '../../lib/error-utils';
import type {
  FeedbackDialogAction,
  FeedbackDialogRequest,
  FeedbackNotificationKind,
} from '../shared/feedback';

export interface FeedbackDialogOptions extends FeedbackDialogRequest {
  /** Extra content under the description, such as a list. */
  body?: ReactNode;
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` makes the confirm button destructive and starts focus on Cancel. */
  tone?: 'default' | 'danger';
}

export interface PromptOptions {
  title: string;
  description?: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Returns an error message to block submitting, or null when the value is acceptable. */
  validate?: (value: string) => string | null;
}

export interface AppFeedbackApi {
  notifySuccess: (message: string) => void;
  notifyInfo: (message: string) => void;
  notifyError: (message: string) => void;
  notify: (message: string, kind?: FeedbackNotificationKind) => void;
  openDialog: (request: FeedbackDialogOptions) => Promise<void>;
  /** Resolves true when confirmed; false on cancel, Escape, or an outside press. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves the trimmed value when submitted; null when cancelled. */
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const AppFeedbackContext = createContext<AppFeedbackApi | null>(null);

interface Outcome {
  accepted: boolean;
  value?: string;
}

type DialogView =
  | { kind: 'feedback'; primary?: FeedbackDialogAction; secondary?: FeedbackDialogAction }
  | {
      kind: 'confirm';
      confirmLabel: string;
      cancelLabel: string;
      tone: 'default' | 'danger';
    }
  | {
      kind: 'prompt';
      label: string;
      defaultValue: string;
      placeholder?: string;
      confirmLabel: string;
      validate?: (value: string) => string | null;
    };

interface ActiveDialog {
  id: number;
  title: string;
  description?: string;
  body?: ReactNode;
  dismissible: boolean;
  view: DialogView;
  /** Settles the caller's promise. Runs once the dialog has been replaced or closed. */
  close: (outcome: Outcome) => void;
}

function ActiveDialogContent({
  dialog,
  closeLabel,
  onSettle,
}: {
  dialog: ActiveDialog;
  closeLabel: string;
  onSettle: (outcome: Outcome) => void;
}) {
  const { view } = dialog;
  const [value, setValue] = useState(view.kind === 'prompt' ? view.defaultValue : '');
  const [pending, setPending] = useState(false);
  const { t } = useTranslation();
  const trimmed = value.trim();
  const validation =
    view.kind === 'prompt' && trimmed && view.validate ? view.validate(trimmed) : null;
  const canSubmit = trimmed.length > 0 && !validation;

  const runFeedbackAction = (action: FeedbackDialogAction) => {
    setPending(true);
    Promise.resolve()
      .then(() => action.onSelect?.())
      .then(() => onSettle({ accepted: true }))
      .catch((error) => {
        logError('Feedback dialog action failed', error);
        setPending(false);
      });
  };

  const dismissible = dialog.dismissible;
  const onSubmitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSubmit) onSettle({ accepted: true, value: trimmed });
  };
  const formId = `feedback-prompt-${dialog.id}`;

  let footer: ReactNode;
  if (view.kind === 'confirm') {
    const danger = view.tone === 'danger';
    footer = (
      <>
        <Button
          type="button"
          variant="secondary"
          data-testid="feedback-confirm-cancel"
          data-initial-focus={danger || undefined}
          onClick={() => onSettle({ accepted: false })}
        >
          {view.cancelLabel}
        </Button>
        <Button
          type="button"
          variant={danger ? 'danger' : 'primary'}
          data-testid="feedback-confirm-confirm"
          data-initial-focus={!danger || undefined}
          onClick={() => onSettle({ accepted: true })}
        >
          {view.confirmLabel}
        </Button>
      </>
    );
  } else if (view.kind === 'prompt') {
    footer = (
      <>
        <Button
          type="button"
          variant="secondary"
          data-testid="feedback-prompt-cancel"
          onClick={() => onSettle({ accepted: false })}
        >
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          form={formId}
          variant="primary"
          data-testid="feedback-prompt-confirm"
          disabled={!canSubmit}
        >
          {view.confirmLabel}
        </Button>
      </>
    );
  } else if (view.primary) {
    const { primary, secondary } = view;
    footer = (
      <>
        {secondary ? (
          <Button
            type="button"
            variant="secondary"
            data-testid="feedback-dialog-secondary-action"
            disabled={pending}
            onClick={() => runFeedbackAction(secondary)}
          >
            {secondary.label}
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            data-testid="feedback-dialog-cancel"
            disabled={pending}
            onClick={() => onSettle({ accepted: false })}
          >
            {t('common.cancel')}
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          data-testid="feedback-dialog-primary-action"
          data-initial-focus
          disabled={pending}
          onClick={() => runFeedbackAction(primary)}
        >
          {primary.label}
        </Button>
      </>
    );
  } else {
    // Informational: one button that closes the dialog. A secondary action, if any, runs on that same press.
    const only = view.secondary;
    footer = (
      <Button
        type="button"
        variant="primary"
        data-testid="feedback-dialog-close"
        data-initial-focus
        disabled={pending}
        onClick={() => (only ? runFeedbackAction(only) : onSettle({ accepted: true }))}
      >
        {only?.label ?? closeLabel}
      </Button>
    );
  }

  return (
    <DialogContent
      data-testid="feedback-dialog"
      title={dialog.title}
      description={dialog.description}
      footer={footer}
      onEscapeKeyDown={dismissible ? undefined : (event) => event.preventDefault()}
      onPointerDownOutside={dismissible ? undefined : (event) => event.preventDefault()}
      onOpenAutoFocus={(event) => {
        const target = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
          '[data-initial-focus]',
        );
        if (!target) return;
        event.preventDefault();
        target.focus();
      }}
    >
      {dialog.body}
      {view.kind === 'prompt' ? (
        <form id={formId} onSubmit={onSubmitPrompt}>
          <Input
            data-testid="feedback-prompt-input"
            data-initial-focus
            label={view.label}
            value={value}
            placeholder={view.placeholder}
            error={validation ?? undefined}
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
          />
        </form>
      ) : null}
    </DialogContent>
  );
}

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<ActiveDialog | null>(null);
  const [open, setOpen] = useState(false);
  const nextDialogId = useRef(0);
  /** The dialog currently open. Ref-backed so a settle never waits for a render. */
  const activeRef = useRef<ActiveDialog | null>(null);

  const present = useCallback((next: ActiveDialog) => {
    const previous = activeRef.current;
    activeRef.current = next;
    previous?.close({ accepted: false });
    setActive(next);
    setOpen(true);
  }, []);

  const settle = useCallback((id: number, outcome: Outcome) => {
    const current = activeRef.current;
    if (!current || current.id !== id) return;
    activeRef.current = null;
    setOpen(false);
    current.close(outcome);
  }, []);

  const openDialog = useCallback(
    (request: FeedbackDialogOptions) =>
      new Promise<void>((resolve) => {
        nextDialogId.current += 1;
        present({
          id: nextDialogId.current,
          title: request.title,
          description: request.description,
          body: request.body,
          dismissible: request.dismissible !== false,
          view: {
            kind: 'feedback',
            primary: request.primaryAction,
            secondary: request.secondaryAction,
          },
          close: () => resolve(),
        });
      }),
    [present],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        nextDialogId.current += 1;
        present({
          id: nextDialogId.current,
          title: options.title,
          description: options.description,
          body: options.body,
          dismissible: true,
          view: {
            kind: 'confirm',
            confirmLabel: options.confirmLabel ?? t('common.confirm'),
            cancelLabel: options.cancelLabel ?? t('common.cancel'),
            tone: options.tone ?? 'default',
          },
          close: (outcome) => resolve(outcome.accepted),
        });
      }),
    [present, t],
  );

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        nextDialogId.current += 1;
        present({
          id: nextDialogId.current,
          title: options.title,
          description: options.description,
          dismissible: true,
          view: {
            kind: 'prompt',
            label: options.label,
            defaultValue: options.defaultValue ?? '',
            placeholder: options.placeholder,
            confirmLabel: options.confirmLabel ?? t('common.confirm'),
            validate: options.validate,
          },
          close: (outcome) => resolve(outcome.accepted ? (outcome.value ?? null) : null),
        });
      }),
    [present, t],
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
    () => ({
      notifySuccess,
      notifyInfo,
      notifyError,
      notify,
      openDialog,
      confirm,
      prompt,
    }),
    [confirm, notify, notifyError, notifyInfo, notifySuccess, openDialog, prompt],
  );

  return (
    <AppFeedbackContext.Provider value={value}>
      {children}
      <Toaster position="bottom-right" richColors />
      <Dialog
        open={open}
        onOpenChange={(next) => {
          const current = activeRef.current;
          if (!next && current) settle(current.id, { accepted: false });
        }}
      >
        {active ? (
          <ActiveDialogContent
            key={active.id}
            dialog={active}
            closeLabel={t('common.close')}
            onSettle={(outcome) => settle(active.id, outcome)}
          />
        ) : null}
      </Dialog>
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
