export async function isRegistered(_shortcut: string): Promise<boolean> {
  return false;
}

type ShortcutWindow = Window & {
  __globalShortcutHandlers?: Record<string, (shortcut: string) => void>;
};

export async function register(
  shortcut: string | string[],
  handler: (shortcut: string) => void,
): Promise<void> {
  // The UI reference captures fire a registered handler directly, since no OS key event reaches the page.
  if (typeof window === 'undefined') return;
  const target = window as ShortcutWindow;
  const handlers = target.__globalShortcutHandlers ?? {};
  for (const key of Array.isArray(shortcut) ? shortcut : [shortcut]) handlers[key] = handler;
  target.__globalShortcutHandlers = handlers;
}

export async function registerAll(
  _shortcuts: string[],
  _handler: (shortcut: string) => void,
): Promise<void> {}

export async function unregister(_shortcut: string | string[]): Promise<void> {}

export async function unregisterAll(): Promise<void> {}
