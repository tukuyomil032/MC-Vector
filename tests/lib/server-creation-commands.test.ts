import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tauriInvokeMock, tauriListenMock } = vi.hoisted(() => ({
  tauriInvokeMock: vi.fn(),
  tauriListenMock: vi.fn(),
}));

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: tauriListenMock,
}));

describe('Rust-owned server creation IPC', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
    tauriListenMock.mockReset();
  });

  it('sends profile fields and import token as a single create request', async () => {
    const result = {
      server: { id: 'rust-generated-id', name: 'Imported', status: 'offline' },
      jarInstalled: true,
    };
    const request = {
      operationId: 'operation-id',
      name: 'Imported',
      version: '1.21.10',
      software: 'Paper',
      port: 25565,
      memoryGb: 4,
      importToken: 'opaque-import-token',
    };
    tauriInvokeMock.mockResolvedValue(result);

    const { createServerProfile } = await import('@/lib/server-creation-commands');
    await expect(createServerProfile(request)).resolves.toEqual(result);

    expect(tauriInvokeMock).toHaveBeenCalledWith('create_server_profile', { request });
  });

  it('subscribes only to the dedicated server creation progress event', async () => {
    const unlisten = vi.fn();
    tauriListenMock.mockResolvedValue(unlisten);
    const { onServerCreationProgress } = await import('@/lib/server-creation-commands');
    const callback = vi.fn();

    await expect(onServerCreationProgress(callback)).resolves.toBe(unlisten);
    expect(tauriListenMock).toHaveBeenCalledWith('server-creation-download-progress', callback);
  });
});
