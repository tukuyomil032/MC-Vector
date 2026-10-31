import { AppFeedbackProvider, useAppFeedback } from '@/renderer/components/AppFeedbackProvider';
import { notify } from '@/renderer/shared/notify';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/** Renders the provider and hands the module-level notify helpers to the test body while mounted. */
function renderWithBridge(run: () => void) {
  function Runner() {
    useAppFeedback();
    return null;
  }
  return render(
    <AppFeedbackProvider>
      <Runner />
      <button type="button" onClick={run}>
        Run
      </button>
    </AppFeedbackProvider>,
  );
}

describe('notify bridge', () => {
  it('shows one progress toast that updates in place and then becomes the result', async () => {
    const { getByRole } = renderWithBridge(() => {
      notify.progress('download-1', { title: 'Downloading Paper 1.21.4', progress: 40 });
      notify.progress('download-1', { title: 'Downloading Paper 1.21.4', progress: 41 });
    });

    act(() => getByRole('button', { name: 'Run' }).click());
    expect(await screen.findByText('41%')).toBeInTheDocument();
    expect(screen.queryByText('40%')).not.toBeInTheDocument();
    expect(screen.getAllByText('Downloading Paper 1.21.4')).toHaveLength(1);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);

    act(() => {
      notify.done('download-1', {
        type: 'success',
        title: 'Server created',
        description: 'Created "Survival".',
      });
    });
    expect(await screen.findByText('Server created')).toBeInTheDocument();
    expect(screen.getByText('Created "Survival".')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.queryByText('41%')).not.toBeInTheDocument();
    expect(screen.queryByText('Downloading Paper 1.21.4')).not.toBeInTheDocument();
  });

  it('clamps out-of-range progress and shows the percentage once', async () => {
    const { getByRole } = renderWithBridge(() => {
      notify.progress('download-2', { title: 'Downloading', progress: 140 });
    });

    act(() => getByRole('button', { name: 'Run' }).click());
    expect(await screen.findByText('100%')).toBeInTheDocument();
    expect(screen.getAllByText(/%$/)).toHaveLength(1);
  });

  it('drops calls made while no stack is mounted', () => {
    expect(notify.success('Nobody is listening')).toBeUndefined();
    expect(notify.progress('orphan', { title: 'Orphan', progress: 10 })).toBeUndefined();
  });
});
