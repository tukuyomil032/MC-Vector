export type UnlistenFn = () => void;

export interface Event<T> {
  event: string;
  payload: T;
  id: number;
  windowLabel: string;
}

export async function listen<T>(
  _event: string,
  _handler: (event: Event<T>) => void,
): Promise<UnlistenFn> {
  return () => {};
}

export async function once<T>(
  _event: string,
  _handler: (event: Event<T>) => void,
): Promise<UnlistenFn> {
  return () => {};
}

export async function emit(_event: string, _payload?: unknown): Promise<void> {}

export async function emitTo(_target: string, _event: string, _payload?: unknown): Promise<void> {}
