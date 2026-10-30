import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokePluginMetadata } from '@/lib/plugin-metadata-ipc';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock('@/lib/tauri-api', () => ({ tauriInvoke: invokeMock }));

describe('plugin metadata search cancellation', () => {
  beforeEach(() => invokeMock.mockReset());

  it('does not dispatch an already aborted search', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      invokePluginMetadata('search_plugin_hangar', {}, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('rejects promptly and ignores late backend results after caller abort', async () => {
    let complete!: (value: unknown) => void;
    invokeMock.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const controller = new AbortController();
    const promise = invokePluginMetadata('search_plugin_hangar', {}, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    complete({ result: [] });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('removes the abort listener on success and failure', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    invokeMock.mockResolvedValueOnce({ result: [] });
    await invokePluginMetadata('search_plugin_hangar', {}, controller.signal);
    expect(remove).toHaveBeenCalledTimes(1);
    invokeMock.mockRejectedValueOnce(new Error('provider error'));
    await expect(
      invokePluginMetadata('search_plugin_hangar', {}, controller.signal),
    ).rejects.toThrow('provider error');
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
