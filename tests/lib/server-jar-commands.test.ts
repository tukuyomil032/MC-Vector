import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({ tauriInvoke: tauriInvokeMock }));

describe('Rust-owned server JAR install plans', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
  });

  it('prepares an install from server identity and requested software/version only', async () => {
    const prepared = { planId: 'one-use-plan', latestVersion: '1.21.10', verified: true };
    tauriInvokeMock.mockResolvedValue(prepared);

    const { prepareServerJarInstall } = await import('@/lib/server-commands');
    await expect(prepareServerJarInstall('server-a', 'Paper', '1.21')).resolves.toEqual(prepared);
    expect(tauriInvokeMock).toHaveBeenCalledWith('prepare_server_jar_install', {
      request: {
        serverId: 'server-a',
        software: 'Paper',
        version: '1.21',
      },
    });
  });

  it('executes only the Rust-issued capability token', async () => {
    const result = { serverId: 'server-a', version: '1.21.10' };
    tauriInvokeMock.mockResolvedValue(result);

    const { executeServerJarInstall } = await import('@/lib/server-commands');
    await expect(executeServerJarInstall('one-use-plan')).resolves.toEqual(result);
    expect(tauriInvokeMock).toHaveBeenCalledWith('execute_server_jar_install', {
      planId: 'one-use-plan',
    });
  });

  it('preserves unavailable provider results', async () => {
    tauriInvokeMock.mockResolvedValue(null);

    const { prepareServerJarInstall } = await import('@/lib/server-commands');
    await expect(prepareServerJarInstall('server-a', 'Forge', '1.21')).resolves.toBeNull();
  });
});
