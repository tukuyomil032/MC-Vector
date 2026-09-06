import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
}));

describe('eula commands', () => {
  beforeEach(() => {
    tauriInvokeMock.mockReset();
  });

  it('gets the EULA status with the server ID', async () => {
    tauriInvokeMock.mockResolvedValueOnce({ accepted: false, fileExists: false });
    const { getServerEulaStatus } = await import('@/lib/eula-commands');

    await expect(getServerEulaStatus('server-1')).resolves.toEqual({
      accepted: false,
      fileExists: false,
    });
    expect(tauriInvokeMock).toHaveBeenCalledWith('get_server_eula_status', {
      serverId: 'server-1',
    });
  });

  it('accepts the EULA with the server ID', async () => {
    tauriInvokeMock.mockResolvedValueOnce(undefined);
    const { acceptServerEula } = await import('@/lib/eula-commands');

    await expect(acceptServerEula('server-1')).resolves.toBeUndefined();
    expect(tauriInvokeMock).toHaveBeenCalledWith('accept_server_eula', {
      serverId: 'server-1',
    });
  });

  it('classifies the backend EULA defense error without swallowing other failures', async () => {
    const { isEulaRequiredError } = await import('@/lib/eula-commands');

    expect(isEulaRequiredError(new Error('[Tauri] start_server failed: eula-required'))).toBe(true);
    expect(isEulaRequiredError(new Error('[Tauri] start_server failed: process failed'))).toBe(
      false,
    );
    expect(isEulaRequiredError('eula-required')).toBe(false);
  });
});
