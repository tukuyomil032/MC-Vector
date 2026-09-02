import { AppFeedbackProvider, useAppFeedback } from '@/renderer/components/AppFeedbackProvider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('renders an accessible blocking dialog and closes on Escape', async () => {
    render(
      <AppFeedbackProvider>
        <FeedbackTrigger />
      </AppFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('dialog');
    expect(screen.getByRole('heading', { name: 'Blocked action' })).toBeInTheDocument();
    expect(screen.getByText('This action requires your attention.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
});
