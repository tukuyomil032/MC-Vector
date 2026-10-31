import type { AppView } from './server declaration';

export interface ViewChangeRequest {
  view: AppView;
  currentView: AppView;
  /** True while a view holds edits that have not been saved. */
  hasUnsavedChanges: () => boolean;
  /** Resolves true when the user agrees to discard the unsaved edits. */
  confirmDiscard: () => Promise<boolean>;
  /** Performs the navigation. */
  apply: (view: AppView) => void;
}

/**
 * The one navigation path shared by the sidebar, rail, drawer, command palette, and shortcuts.
 * Leaving a view with unsaved edits waits for an explicit discard; the view does not change otherwise.
 * Resolves true only when the view actually changed.
 */
export async function requestViewChange(request: ViewChangeRequest): Promise<boolean> {
  if (request.view === request.currentView) return false;
  if (request.hasUnsavedChanges() && !(await request.confirmDiscard())) return false;
  request.apply(request.view);
  return true;
}
