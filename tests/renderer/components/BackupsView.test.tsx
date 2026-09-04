import { persistBackupCatalogBestEffort } from '@/renderer/components/BackupsView';
import { describe, expect, it, vi } from 'vitest';

describe('persistBackupCatalogBestEffort', () => {
  it('reports success without intercepting a successful catalog write', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const onFailure = vi.fn();

    await expect(persistBackupCatalogBestEffort(persist, onFailure)).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('reports metadata failure without turning it into a primary operation failure', async () => {
    const error = new Error('catalog unavailable');
    const persist = vi.fn().mockRejectedValue(error);
    const onFailure = vi.fn();

    await expect(persistBackupCatalogBestEffort(persist, onFailure)).resolves.toBe(false);
    expect(onFailure).toHaveBeenCalledWith(error);
  });
});
