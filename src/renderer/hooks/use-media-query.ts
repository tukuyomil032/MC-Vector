import { useSyncExternalStore } from 'react';

const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/**
 * Tracks a CSS media query. Returns false where matchMedia is missing (jsdom, very old WebViews),
 * so layouts fall back to their desktop form.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!canMatch()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => canMatch() && window.matchMedia(query).matches,
    () => false,
  );
}
