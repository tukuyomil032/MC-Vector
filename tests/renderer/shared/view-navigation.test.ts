import type { AppView } from '@/renderer/shared/server declaration';
import { requestViewChange } from '@/renderer/shared/view-navigation';
import { describe, expect, it, vi } from 'vitest';

function request(overrides: {
  view?: AppView;
  currentView?: AppView;
  unsaved?: boolean;
  discard?: boolean;
}) {
  const apply = vi.fn();
  const confirmDiscard = vi.fn(async () => overrides.discard ?? false);
  const result = requestViewChange({
    view: overrides.view ?? 'console',
    currentView: overrides.currentView ?? 'properties',
    hasUnsavedChanges: () => overrides.unsaved ?? false,
    confirmDiscard,
    apply,
  });
  return { result, apply, confirmDiscard };
}

describe('requestViewChange', () => {
  it('moves straight to the next view when nothing is unsaved', async () => {
    const { result, apply, confirmDiscard } = request({ unsaved: false });

    await expect(result).resolves.toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith('console');
  });

  it('keeps the current view when the user cancels the discard prompt', async () => {
    const { result, apply, confirmDiscard } = request({ unsaved: true, discard: false });

    await expect(result).resolves.toBe(false);
    expect(confirmDiscard).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it('moves to the next view after the user confirms the discard', async () => {
    const { result, apply, confirmDiscard } = request({ unsaved: true, discard: true });

    await expect(result).resolves.toBe(true);
    expect(confirmDiscard).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('console');
  });

  it('does not prompt or change anything when the view is already open', async () => {
    const { result, apply, confirmDiscard } = request({
      view: 'properties',
      currentView: 'properties',
      unsaved: true,
    });

    await expect(result).resolves.toBe(false);
    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
});
