import { act, renderHook, waitFor } from '@testing-library/react';
import { useAppUpdater } from '@/renderer/hooks/use-app-updater';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkForUpdatesMock, clearPendingUpdateMock, downloadAndInstallUpdateMock, logErrorMock } =
  vi.hoisted(() => ({
    checkForUpdatesMock: vi.fn(),
    clearPendingUpdateMock: vi.fn(),
    downloadAndInstallUpdateMock: vi.fn(),
    logErrorMock: vi.fn(),
  }));

vi.mock('@/lib/update-commands', () => ({
  checkForUpdates: checkForUpdatesMock,
  clearPendingUpdate: clearPendingUpdateMock,
  downloadAndInstallUpdate: downloadAndInstallUpdateMock,
}));
vi.mock('@/lib/error-utils', () => ({ logError: logErrorMock, toErrorMessage: String }));

describe('useAppUpdater', () => {
  beforeEach(() => {
    checkForUpdatesMock.mockReset();
    clearPendingUpdateMock.mockReset();
    downloadAndInstallUpdateMock.mockReset();
    logErrorMock.mockReset();
  });

  it('opens the shared update prompt for an update found by a Settings check', async () => {
    checkForUpdatesMock.mockResolvedValueOnce({ available: false }).mockResolvedValueOnce({
      available: true,
      version: '2.0.64-beta.2',
      body: '## v2.0.64-beta.2\n### Features\n- Shared update flow',
    });

    const { result } = renderHook(() => useAppUpdater());
    await waitFor(() => expect(result.current.updateCheckStatus).toBe('not-available'));

    await act(async () => result.current.handleCheckForUpdates());

    expect(checkForUpdatesMock).toHaveBeenCalledTimes(2);
    expect(result.current.updatePrompt).toEqual({
      version: '2.0.64-beta.2',
      releaseNotes: '## v2.0.64-beta.2\n### Features\n- Shared update flow',
    });
    expect(result.current.updateCheckStatus).toBe('available');
  });

  it('clears the shared pending candidate and checks once after a channel change event', async () => {
    checkForUpdatesMock
      .mockResolvedValueOnce({ available: true, version: '2.0.64-beta.2', body: 'Beta notes' })
      .mockResolvedValueOnce({ available: false });

    const { result } = renderHook(() => useAppUpdater());
    await waitFor(() => expect(result.current.updatePrompt?.version).toBe('2.0.64-beta.2'));

    await act(async () => {
      window.dispatchEvent(new CustomEvent('mc-vector:update-channel-changed'));
    });

    await waitFor(() => expect(result.current.updateCheckStatus).toBe('not-available'));
    expect(result.current.updatePrompt).toBeNull();
    expect(clearPendingUpdateMock).toHaveBeenCalledTimes(1);
    expect(checkForUpdatesMock).toHaveBeenCalledTimes(2);
  });

  it('ignores an in-flight old-channel candidate and shows only the follow-up result', async () => {
    let resolveInitialCheck!: (result: {
      available: boolean;
      version?: string;
      body?: string;
    }) => void;
    let resolveFollowUpCheck!: (result: {
      available: boolean;
      version?: string;
      body?: string;
    }) => void;
    checkForUpdatesMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitialCheck = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFollowUpCheck = resolve;
          }),
      );

    const { result } = renderHook(() => useAppUpdater());
    await waitFor(() => expect(checkForUpdatesMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new CustomEvent('mc-vector:update-channel-changed'));
    });
    expect(clearPendingUpdateMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInitialCheck({ available: true, version: '2.0.64-old', body: 'Old channel' });
    });
    await waitFor(() => expect(checkForUpdatesMock).toHaveBeenCalledTimes(2));

    expect(result.current.updatePrompt).toBeNull();
    expect(result.current.updateCheckStatus).toBe('checking');

    await act(async () => {
      resolveFollowUpCheck({ available: true, version: '2.0.65-current', body: 'New channel' });
    });

    expect(result.current.updatePrompt).toEqual({
      version: '2.0.65-current',
      releaseNotes: 'New channel',
    });
    expect(checkForUpdatesMock).toHaveBeenCalledTimes(2);
  });

  it('keeps no-update and check-error results available to Settings', async () => {
    checkForUpdatesMock
      .mockResolvedValueOnce({ available: false })
      .mockResolvedValueOnce({ available: false, error: 'Feed unavailable' });

    const { result } = renderHook(() => useAppUpdater());
    await waitFor(() => expect(result.current.updateCheckStatus).toBe('not-available'));

    await act(async () => result.current.handleCheckForUpdates());

    await waitFor(() => expect(result.current.updateCheckStatus).toBe('error'));
    expect(result.current.updateCheckError).toBe('Feed unavailable');
    expect(result.current.updatePrompt).toBeNull();
  });

  it('uses the shared modal update handler for download progress', async () => {
    checkForUpdatesMock.mockResolvedValueOnce({
      available: true,
      version: '2.0.64',
      body: '## v2.0.64\n### Features\n- Shared download',
    });
    downloadAndInstallUpdateMock.mockImplementation(async (onProgress) => {
      onProgress(25, 100);
    });

    const { result } = renderHook(() => useAppUpdater());
    await waitFor(() => expect(result.current.updatePrompt?.version).toBe('2.0.64'));

    await act(async () => result.current.handleUpdateNow());

    expect(downloadAndInstallUpdateMock).toHaveBeenCalledTimes(1);
    // Once the update is installed, progress clears and the restart state takes over.
    expect(result.current.updateProgress).toBeNull();
    expect(result.current.updateReady).toBe(true);
  });
});
