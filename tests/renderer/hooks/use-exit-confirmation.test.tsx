import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Translate } from '@/i18n';
import { useExitConfirmation } from '@/renderer/hooks/use-exit-confirmation';

type CloseHandler = (event: { preventDefault: () => void }) => Promise<void>;

const windowMock = vi.hoisted(() => ({
  handler: undefined as CloseHandler | undefined,
  close: vi.fn(async () => {}),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (handler: CloseHandler) => {
      windowMock.handler = handler;
      return () => {};
    },
    close: windowMock.close,
  }),
}));

const t = ((key: string) => key) as Translate;

function closeEvent() {
  const preventDefault = vi.fn();
  return { event: { preventDefault }, preventDefault };
}

async function requestClose(event: { preventDefault: () => void }) {
  await windowMock.handler?.(event);
}

describe('useExitConfirmation', () => {
  beforeEach(() => {
    windowMock.handler = undefined;
    windowMock.close.mockClear();
  });

  it('lets the window close when no server is active', async () => {
    const confirm = vi.fn(async () => true);
    renderHook(() => useExitConfirmation({ activeServerCount: 0, confirm, t }));
    await vi.waitFor(() => expect(windowMock.handler).toBeDefined());

    const { event, preventDefault } = closeEvent();
    await requestClose(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('holds the close while servers run and keeps the window open when the user cancels', async () => {
    const confirm = vi.fn(async () => false);
    renderHook(() => useExitConfirmation({ activeServerCount: 2, confirm, t }));
    await vi.waitFor(() => expect(windowMock.handler).toBeDefined());

    const { event, preventDefault } = closeEvent();
    await requestClose(event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'server.exit.title', tone: 'danger' }),
    );
    expect(windowMock.close).not.toHaveBeenCalled();
  });

  it('closes the window after the user confirms and does not ask again', async () => {
    const confirm = vi.fn(async () => true);
    renderHook(() => useExitConfirmation({ activeServerCount: 1, confirm, t }));
    await vi.waitFor(() => expect(windowMock.handler).toBeDefined());

    const first = closeEvent();
    await requestClose(first.event);
    expect(first.preventDefault).toHaveBeenCalledTimes(1);
    expect(windowMock.close).toHaveBeenCalledTimes(1);

    const second = closeEvent();
    await requestClose(second.event);
    expect(second.preventDefault).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
