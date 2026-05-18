import { create } from 'zustand';
import type { AppView } from '../renderer/shared/server declaration';

interface UiStoreState {
  currentView: AppView;
  isSidebarOpen: boolean;
  showAddServerModal: boolean;
  setCurrentView: (view: AppView) => void;
  setIsSidebarOpen: (open: boolean) => void;
  setShowAddServerModal: (open: boolean) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  currentView: 'dashboard',
  isSidebarOpen: true,
  showAddServerModal: false,
  setCurrentView: (view) => set({ currentView: view }),
  setIsSidebarOpen: (open) => set({ isSidebarOpen: open }),
  setShowAddServerModal: (open) => set({ showAddServerModal: open }),
}));
