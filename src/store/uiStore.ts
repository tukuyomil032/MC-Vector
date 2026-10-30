import { create } from 'zustand';
import type { AppView } from '../renderer/shared/server declaration';

/** Per-viewer convenience: the expanded or collapsed choice the user made on a wide window. */
const SIDEBAR_STORAGE_KEY = 'mc-vector:sidebar-open';

function readSidebarPreference(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false';
  } catch {
    // Storage can be blocked. The sidebar then starts expanded and the choice lasts for this session only.
    return true;
  }
}

function writeSidebarPreference(open: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
  } catch {
    // Ignored: the store value still applies for this session.
  }
}

interface UiStoreState {
  currentView: AppView;
  /** The view that was showing before `currentView`. Null until the first navigation. */
  previousView: AppView | null;
  /** The user's expanded (true) or collapsed (false) choice. Responsive layout may still show the rail. */
  isSidebarOpen: boolean;
  showAddServerModal: boolean;
  setCurrentView: (view: AppView) => void;
  /** Goes back to `previousView`, or to the dashboard when there is none (or it would be the settings screen itself). */
  returnToPreviousView: () => void;
  /** Only the sidebar toggle calls this, and only on wide windows, so the stored choice is always deliberate. */
  setIsSidebarOpen: (open: boolean) => void;
  setShowAddServerModal: (open: boolean) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  currentView: 'dashboard',
  previousView: null,
  isSidebarOpen: readSidebarPreference(),
  showAddServerModal: false,
  setCurrentView: (view) =>
    set((state) =>
      state.currentView === view ? state : { currentView: view, previousView: state.currentView },
    ),
  returnToPreviousView: () =>
    set((state) => {
      const target =
        state.previousView && state.previousView !== 'app-settings'
          ? state.previousView
          : 'dashboard';
      return target === state.currentView
        ? state
        : { currentView: target, previousView: state.currentView };
    }),
  setIsSidebarOpen: (open) => {
    writeSidebarPreference(open);
    set({ isSidebarOpen: open });
  },
  setShowAddServerModal: (open) => set({ showAddServerModal: open }),
}));
