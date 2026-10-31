import {
  ToastStack,
  ToastStackProvider,
  useToastStack,
} from '@/components/arc/toast-stack/toast-stack';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function Harness({ onReady }: { onReady: (api: ReturnType<typeof useToastStack>) => void }) {
  const api = useToastStack();
  onReady(api);
  return null;
}

function renderStack() {
  const holder: { api?: ReturnType<typeof useToastStack> } = {};
  render(
    <ToastStackProvider>
      <Harness
        onReady={(value) => {
          holder.api = value;
        }}
      />
      <ToastStack label="Test notifications" hotkey={false} />
    </ToastStackProvider>,
  );
  return () => {
    if (!holder.api) throw new Error('Toast stack API is not ready');
    return holder.api;
  };
}

describe('Arc toast progress', () => {
  it('shows one bar and one percentage while the toast is in progress', async () => {
    const api = renderStack();
    let id = '';
    act(() => {
      id = api().toast({ type: 'loading', title: 'Downloading', progress: 42, duration: Infinity });
    });

    const bar = await screen.findByRole('progressbar', { name: 'Downloading' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getAllByText('42%')).toHaveLength(1);

    act(() => api().update(id, { progress: 75 }));
    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  it('removes the bar and percentage once the type becomes success', async () => {
    const api = renderStack();
    let id = '';
    act(() => {
      id = api().toast({ type: 'loading', title: 'Downloading', progress: 10, duration: Infinity });
    });
    await screen.findByText('10%');

    act(() => {
      api().update(id, { type: 'success', title: 'Done', progress: undefined, duration: 60_000 });
    });
    expect(screen.getByText('Done')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.queryByText('10%')).not.toBeInTheDocument();
  });

  it('keeps the toast closable with its dismiss button while it shows progress', async () => {
    const api = renderStack();
    act(() => {
      api().toast({ type: 'loading', title: 'Downloading', progress: 5, duration: Infinity });
    });
    await screen.findByText('5%');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(screen.queryByText('Downloading')).not.toBeInTheDocument());
  });
});
