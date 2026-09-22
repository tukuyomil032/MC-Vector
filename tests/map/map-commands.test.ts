import { describe, expect, it, vi } from 'vitest';

const { tauriListenMock } = vi.hoisted(() => ({
  tauriListenMock: vi.fn(),
}));

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: vi.fn(),
  tauriListen: tauriListenMock,
}));

describe('Core artifact IPC events', () => {
  it('registers the redacted Core artifact progress event', async () => {
    const { onMapCoreArtifactProgress } = await import('@/map/api/map-commands');
    const callback = vi.fn();
    const unlisten = vi.fn();
    tauriListenMock.mockResolvedValueOnce(unlisten);

    await expect(onMapCoreArtifactProgress(callback)).resolves.toBe(unlisten);
    expect(tauriListenMock).toHaveBeenCalledWith('map-core-artifact-progress', callback);
  });
});
