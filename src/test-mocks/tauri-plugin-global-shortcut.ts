export async function isRegistered(_shortcut: string): Promise<boolean> {
  return false;
}

export async function register(
  _shortcut: string | string[],
  _handler: (shortcut: string) => void,
): Promise<void> {}

export async function registerAll(
  _shortcuts: string[],
  _handler: (shortcut: string) => void,
): Promise<void> {}

export async function unregister(_shortcut: string | string[]): Promise<void> {}

export async function unregisterAll(): Promise<void> {}
