import { renderHook, waitFor, act } from '@testing-library/react';
import { useAppUpdater } from '@/renderer/hooks/use-app-updater';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkForUpdatesMock, downloadAndInstallUpdateMock, logErrorMock } = vi.hoisted(() => ({
  checkForUpdatesMock: vi.fn(),
  downloadAndInstallUpdateMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock('@/lib/update-commands', () => ({
  checkForUpdates: checkForUpdatesMock,
  downloadAndInstallUpdate: downloadAndInstallUpdateMock,
}));
vi.mock('@/lib/error-utils', () => ({ logError: logErrorMock, toErrorMessage: String }));

describe('useAppUpdater', () => {
  beforeEach(() => {
    checkForUpdatesMock.mockReset();
    downloadAndInstallUpdateMock.mockReset();
    logErrorMock.mockReset();
  });

  it('clears an existing prompt and rechecks after a channel change event', async () => {
    checkForUpdatesMock
      .mockResolvedValueOnce({ available: true, version: '2.0.64-beta.2', body: 'Beta notes' })
      .mockResolvedValueOnce({ available: false });

    const { result } = renderHook(() => useAppUpdater());
    await waitFor(() => expect(result.current.updatePrompt?.version).toBe('2.0.64-beta.2'));

    await act(async () => {
      window.dispatchEvent(new CustomEvent('mc-vector:update-channel-changed'));
    });

    await waitFor(() => expect(result.current.updatePrompt).toBeNull());
    expect(checkForUpdatesMock).toHaveBeenCalledTimes(2);
  });
});
