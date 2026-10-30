import { AppFeedbackProvider, useAppFeedback } from '@/renderer/components/AppFeedbackProvider';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

function FeedbackTrigger() {
  const { notifySuccess, openDialog } = useAppFeedback();

  return (
    <>
      <button type="button" onClick={() => notifySuccess('Saved successfully')}>
        Notify
      </button>
      <button
        type="button"
        onClick={() =>
          void openDialog({
            severity: 'warning',
            title: 'Blocked action',
            description: 'This action requires your attention.',
            primaryAction: { label: 'Continue', onSelect: vi.fn() },
          })
        }
      >
        Open dialog
      </button>
    </>
  );
}

describe('AppFeedbackProvider', () => {
  it('routes success notifications to toast without moving focus', () => {
    const successToast = vi.spyOn(toast, 'success').mockReturnValue('toast-id');
    render(
      <AppFeedbackProvider>
        <FeedbackTrigger />
      </AppFeedbackProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Notify' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(successToast).toHaveBeenCalledWith('Saved successfully');
    expect(document.activeElement).toBe(trigger);
    successToast.mockRestore();
  });

  it('renders an accessible blocking dialog with one cancel and one primary action', async () => {
    render(
      <AppFeedbackProvider>
        <FeedbackTrigger />
      </AppFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('dialog');
    expect(screen.getByRole('heading', { name: 'Blocked action' })).toBeInTheDocument();
    expect(screen.getByText('This action requires your attention.')).toBeInTheDocument();
    // The dialog has no X in the header, and the footer holds a single cancel next to the primary action.
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.getByTestId('feedback-dialog-primary-action')).toHaveTextContent('Continue');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a single close button for an informational dialog', async () => {
    function InfoTrigger() {
      const { openDialog } = useAppFeedback();
      return (
        <button
          type="button"
          onClick={() =>
            void openDialog({
              severity: 'info',
              title: 'Heads up',
              description: 'Nothing to do here.',
            })
          }
        >
          Open info
        </button>
      );
    }

    render(
      <AppFeedbackProvider>
        <InfoTrigger />
      </AppFeedbackProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open info' }));
    const dialog = await screen.findByRole('dialog');

    expect(screen.getByTestId('feedback-dialog-close')).toHaveTextContent('Close');
    expect(screen.queryByTestId('feedback-dialog-primary-action')).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
  });

  it('keeps the dialog action promise pending until an async action completes', async () => {
    let resolveAction: (() => void) | undefined;
    const action = new Promise<void>((resolve) => {
      resolveAction = resolve;
    });

    function AsyncTrigger() {
      const { openDialog } = useAppFeedback();
      return (
        <button
          type="button"
          onClick={() =>
            void openDialog({
              severity: 'error',
              title: 'Async action',
              description: 'Waiting for the action.',
              primaryAction: { label: 'Run', onSelect: () => action },
            })
          }
        >
          Open async dialog
        </button>
      );
    }

    render(
      <AppFeedbackProvider>
        <AsyncTrigger />
      </AppFeedbackProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open async dialog' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run' }));
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();

    resolveAction?.();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('resolves confirm with true when the primary button is pressed', async () => {
    const outcome = vi.fn();
    function ConfirmTrigger() {
      const { confirm } = useAppFeedback();
      return (
        <button
          type="button"
          onClick={() =>
            void confirm({ title: 'Install plugin?', description: 'It will be copied.' }).then(
              outcome,
            )
          }
        >
          Ask
        </button>
      );
    }

    render(
      <AppFeedbackProvider>
        <ConfirmTrigger />
      </AppFeedbackProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await screen.findByRole('dialog');
    expect(screen.getByTestId('feedback-confirm-confirm')).toHaveFocus();

    fireEvent.click(screen.getByTestId('feedback-confirm-confirm'));
    await waitFor(() => expect(outcome).toHaveBeenCalledWith(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('starts focus on Cancel for a danger confirm and resolves false on Escape', async () => {
    const outcome = vi.fn();
    function DangerTrigger() {
      const { confirm } = useAppFeedback();
      return (
        <button
          type="button"
          onClick={() =>
            void confirm({
              title: 'Delete world',
              description: 'This cannot be undone.',
              confirmLabel: 'Delete',
              tone: 'danger',
            }).then(outcome)
          }
        >
          Delete
        </button>
      );
    }

    render(
      <AppFeedbackProvider>
        <DangerTrigger />
      </AppFeedbackProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(screen.getByTestId('feedback-confirm-cancel')).toHaveFocus();
    expect(screen.getByTestId('feedback-confirm-confirm')).toHaveTextContent('Delete');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(outcome).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the prompt confirm disabled until a valid value is entered, then resolves the trimmed value', async () => {
    const outcome = vi.fn();
    function PromptTrigger() {
      const { prompt } = useAppFeedback();
      return (
        <button
          type="button"
          onClick={() =>
            void prompt({
              title: 'Save template',
              label: 'Template name',
              validate: (value) => (value.length > 8 ? 'Too long' : null),
            }).then(outcome)
          }
        >
          Prompt
        </button>
      );
    }

    render(
      <AppFeedbackProvider>
        <PromptTrigger />
      </AppFeedbackProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Prompt' }));
    await screen.findByRole('dialog');
    const input = screen.getByTestId('feedback-prompt-input');
    const confirm = screen.getByTestId('feedback-prompt-confirm');
    expect(input).toHaveFocus();
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: 'this-name-is-too-long' } });
    expect(screen.getByText('Too long')).toBeInTheDocument();
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: '  kit  ' } });
    expect(confirm).toBeEnabled();
    await act(async () => {
      fireEvent.submit(input.closest('form') as HTMLFormElement);
    });
    await waitFor(() => expect(outcome).toHaveBeenCalledWith('kit'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('resolves prompt with null when cancelled', async () => {
    const outcome = vi.fn();
    function PromptTrigger() {
      const { prompt } = useAppFeedback();
      return (
        <button
          type="button"
          onClick={() => void prompt({ title: 'Name it', label: 'Name' }).then(outcome)}
        >
          Prompt
        </button>
      );
    }

    render(
      <AppFeedbackProvider>
        <PromptTrigger />
      </AppFeedbackProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Prompt' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByTestId('feedback-prompt-cancel'));
    await waitFor(() => expect(outcome).toHaveBeenCalledWith(null));
  });
});
