import { recordE2eCall } from '../e2e/support/e2e-runtime';

export type UnlistenFn = () => void;

export interface Event<T> {
  event: string;
  payload: T;
  id: number;
  windowLabel: string;
}

type Listener = (event: Event<unknown>) => void;
const listeners = new Map<string, Set<Listener>>();

export async function listen<T>(
  event: string,
  handler: (event: Event<T>) => void,
): Promise<UnlistenFn> {
  recordE2eCall('ipc', 'listen', { event });
  const listener = handler as (event: Event<unknown>) => void;
  const eventListeners = listeners.get(event) ?? new Set<Listener>();
  eventListeners.add(listener);
  listeners.set(event, eventListeners);
  return () => {
    eventListeners.delete(listener);
  };
}

export async function once<T>(
  event: string,
  handler: (event: Event<T>) => void,
): Promise<UnlistenFn> {
  const unlisten = await listen(event, (payload) => {
    unlisten();
    handler(payload as Event<T>);
  });
  return unlisten;
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  recordE2eCall('ipc', 'emit', { event, payload });
  const eventListeners = listeners.get(event);
  if (!eventListeners) return;
  const eventPayload: Event<unknown> = {
    event,
    payload,
    id: 1,
    windowLabel: 'main',
  };
  for (const listener of eventListeners) listener(eventPayload);
}

export async function emitTo(target: string, event: string, payload?: unknown): Promise<void> {
  recordE2eCall('ipc', 'emitTo', { target, event, payload });
  await emit(event, payload);
}
