import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();
const tauriListenMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: tauriListenMock,
}));

describe('Rust-owned server automation commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
    tauriListenMock.mockReset();
  });

  it('cancels a pending restart and optionally resets attempts in Rust', async () => {
    const { cancelAutoRestart } = await import('@/lib/server-automation-commands');
    await cancelAutoRestart('server-a');
    await cancelAutoRestart('server-a', true);

    expect(tauriInvokeMock).toHaveBeenNthCalledWith(1, 'cancel_auto_restart', {
      serverId: 'server-a',
      resetAttempts: false,
    });
    expect(tauriInvokeMock).toHaveBeenNthCalledWith(2, 'cancel_auto_restart', {
      serverId: 'server-a',
      resetAttempts: true,
    });
  });

  it('resumes only a Rust-approved restart after the EULA UI returns acceptance', async () => {
    const { resumeAutoRestartAfterEula } = await import('@/lib/server-automation-commands');
    await resumeAutoRestartAfterEula('server-a');

    expect(tauriInvokeMock).toHaveBeenCalledWith('resume_auto_restart_after_eula', {
      serverId: 'server-a',
    });
  });

  it('subscribes to the structured automation event topic', async () => {
    const dispose = vi.fn();
    tauriListenMock.mockResolvedValueOnce(dispose);
    const { onServerAutomationEvent } = await import('@/lib/server-automation-commands');
    const callback = vi.fn();

    await expect(onServerAutomationEvent(callback)).resolves.toBe(dispose);
    expect(tauriListenMock).toHaveBeenCalledWith('server-automation-event', callback);
  });
});
