import { useEffect } from 'react';
import type { AppView } from '../shared/server declaration';

const TAB_CYCLE: AppView[] = [
  'dashboard',
  'console',
  'users',
  'files',
  'plugins',
  'backups',
  'properties',
  'general-settings',
  'proxy',
];

interface UseViewCycleShortcutOptions {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
}

export function useViewCycleShortcut({ currentView, setCurrentView }: UseViewCycleShortcutOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        const delta = event.shiftKey ? -1 : 1;
        const idx = TAB_CYCLE.indexOf(currentView);
        const baseIdx = idx === -1 ? 0 : idx;
        const next = TAB_CYCLE[(baseIdx + delta + TAB_CYCLE.length) % TAB_CYCLE.length];
        setCurrentView(next);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentView, setCurrentView]);
}
