import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: vi.fn(),
}));

describe('ngrok-commands credential boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
  });

  it('does not expose a token-valued getter', async () => {
    const commands = await import('@/lib/ngrok-commands');
    expect('getNgrokToken' in commands).toBe(false);
  });

  it('returns only credential status', async () => {
    tauriInvokeMock.mockResolvedValueOnce({ configured: false });
    const { getNgrokTokenStatus } = await import('@/lib/ngrok-commands');
    await expect(getNgrokTokenStatus()).resolves.toEqual({ configured: false });
    expect(tauriInvokeMock).toHaveBeenCalledWith('get_ngrok_token_status', {});
  });
});
