import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({ tauriInvoke: tauriInvokeMock }));

describe('server-lifecycle-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
  });

  it('clones a server and receives the Rust-generated profile', async () => {
    const cloned = {
      id: 'rust-generated-id',
      name: 'Source copy',
      path: '/app/servers/rust-generated-id',
      status: 'offline',
    };
    tauriInvokeMock.mockResolvedValueOnce(cloned);

    const { cloneServerProfile } = await import('@/lib/server-lifecycle-commands');
    await expect(cloneServerProfile('source-id', 'Source copy')).resolves.toEqual(cloned);
    expect(tauriInvokeMock).toHaveBeenCalledWith('clone_server_profile', {
      sourceServerId: 'source-id',
      name: 'Source copy',
    });
  });

  it('propagates a Rust refusal to clone a running server', async () => {
    tauriInvokeMock.mockRejectedValueOnce(new Error('Cannot clone a running server'));

    const { cloneServerProfile } = await import('@/lib/server-lifecycle-commands');
    await expect(cloneServerProfile('source-id', 'Source copy')).rejects.toThrow(
      'Cannot clone a running server',
    );
  });

  it('deletes a server and its directory through one Rust command', async () => {
    tauriInvokeMock.mockResolvedValueOnce(true);

    const { deleteManagedServer } = await import('@/lib/server-lifecycle-commands');
    await expect(deleteManagedServer('server-id')).resolves.toBe(true);
    expect(tauriInvokeMock).toHaveBeenCalledWith('delete_managed_server', {
      serverId: 'server-id',
    });
  });

  it('propagates a Rust refusal to delete a running server', async () => {
    tauriInvokeMock.mockRejectedValueOnce(new Error('Cannot delete a running server'));

    const { deleteManagedServer } = await import('@/lib/server-lifecycle-commands');
    await expect(deleteManagedServer('server-id')).rejects.toThrow(
      'Cannot delete a running server',
    );
  });
});
