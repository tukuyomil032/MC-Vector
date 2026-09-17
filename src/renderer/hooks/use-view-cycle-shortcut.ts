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
  'map',
  'proxy',
];

interface UseViewCycleShortcutOptions {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  includeMap: boolean;
}

export function useViewCycleShortcut({
  currentView,
  setCurrentView,
  includeMap,
}: UseViewCycleShortcutOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        const delta = event.shiftKey ? -1 : 1;
        const cycle = includeMap ? TAB_CYCLE : TAB_CYCLE.filter((view) => view !== 'map');
        const idx = cycle.indexOf(currentView);
        const baseIdx = idx === -1 ? 0 : idx;
        const next = cycle[(baseIdx + delta + cycle.length) % cycle.length];
        setCurrentView(next);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentView, includeMap, setCurrentView]);
}
