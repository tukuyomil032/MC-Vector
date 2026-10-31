import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '@/store/uiStore';

const SIDEBAR_KEY = 'mc-vector:sidebar-open';

describe('uiStore view history', () => {
  beforeEach(() => {
    useUiStore.setState({ currentView: 'dashboard', previousView: null });
  });

  it('records the view that was showing before a navigation', () => {
    useUiStore.getState().setCurrentView('app-settings');

    expect(useUiStore.getState().currentView).toBe('app-settings');
    expect(useUiStore.getState().previousView).toBe('dashboard');
  });

  it('keeps the previous view when the current view is selected again', () => {
    const { setCurrentView } = useUiStore.getState();
    setCurrentView('console');
    setCurrentView('console');

    expect(useUiStore.getState().previousView).toBe('dashboard');
  });

  it('returns to the view that opened the settings screen', () => {
    useUiStore.getState().setCurrentView('properties');
    useUiStore.getState().setCurrentView('app-settings');

    useUiStore.getState().returnToPreviousView();

    expect(useUiStore.getState().currentView).toBe('properties');
  });

  it('falls back to the dashboard when no previous view is known', () => {
    useUiStore.setState({ currentView: 'app-settings', previousView: null });

    useUiStore.getState().returnToPreviousView();

    expect(useUiStore.getState().currentView).toBe('dashboard');
  });

  it('never returns to the settings screen itself', () => {
    useUiStore.setState({ currentView: 'proxy', previousView: 'app-settings' });

    useUiStore.getState().returnToPreviousView();

    expect(useUiStore.getState().currentView).toBe('dashboard');
  });
});

describe('uiStore sidebar preference', () => {
  beforeEach(() => {
    window.localStorage.removeItem(SIDEBAR_KEY);
    useUiStore.setState({ isSidebarOpen: true });
  });

  it('stores the expanded or collapsed choice made through the toggle', () => {
    useUiStore.getState().setIsSidebarOpen(false);
    expect(window.localStorage.getItem(SIDEBAR_KEY)).toBe('false');

    useUiStore.getState().setIsSidebarOpen(true);
    expect(window.localStorage.getItem(SIDEBAR_KEY)).toBe('true');
  });
});
