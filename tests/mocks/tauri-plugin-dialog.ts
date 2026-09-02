import { getE2eState, recordE2eCall } from '../e2e/support/e2e-runtime';

type E2eWindow = Window & {
  __dialogConfirm?: boolean;
  __dialogSelectedPath?: string | string[] | null;
};

export async function open(options?: unknown): Promise<string | string[] | null> {
  recordE2eCall('dialog', 'open', options);
  const value = (window as E2eWindow).__dialogSelectedPath;
  if (value !== undefined) return value;
  return `/mock/external/e2e-import-${getE2eState().servers[0]?.id ?? 'server-1'}`;
}

export async function save(options?: unknown): Promise<string | null> {
  recordE2eCall('dialog', 'save', options);
  return '/mock/external/e2e-export.txt';
}

export async function ask(message: string, options?: unknown): Promise<boolean> {
  recordE2eCall('dialog', 'ask', { message, options });
  return (window as E2eWindow).__dialogConfirm === true;
}

export async function confirm(message: string, options?: unknown): Promise<boolean> {
  recordE2eCall('dialog', 'confirm', { message, options });
  return (window as E2eWindow).__dialogConfirm === true;
}

export async function message(messageText: string, options?: unknown): Promise<void> {
  recordE2eCall('dialog', 'message', { message: messageText, options });
}
