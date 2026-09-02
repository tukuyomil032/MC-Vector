export async function open(_options?: unknown): Promise<string | string[] | null> {
  return null;
}

export async function save(_options?: unknown): Promise<string | null> {
  return null;
}

export async function ask(_message: string, _options?: unknown): Promise<boolean> {
  return (window as unknown as Record<string, unknown>).__dialogConfirm === true;
}

export async function confirm(_message: string, _options?: unknown): Promise<boolean> {
  return (window as unknown as Record<string, unknown>).__dialogConfirm === true;
}

export async function message(_message: string, _options?: unknown): Promise<void> {}
