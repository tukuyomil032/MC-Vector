import { useEffect } from 'react';

/** One entry per mounted view that holds unsaved edits. */
const dirtyViews = new Set<symbol>();

/**
 * True while any view registered through `useUnsavedChangesGuard` has edits that are not saved yet.
 * Navigation code can ask this before it leaves the view and show a confirmation when it returns true.
 */
export function hasUnsavedViewChanges(): boolean {
  return dirtyViews.size > 0;
}

/**
 * Tracks a view's unsaved state for `hasUnsavedViewChanges`, and asks the webview to confirm before it closes
 * while edits are pending. The entry is removed when `dirty` clears or the view unmounts.
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const owner = Symbol('unsaved-view');
    dirtyViews.add(owner);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      dirtyViews.delete(owner);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);
}
