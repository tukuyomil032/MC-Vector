import { getE2eRuntime } from '../e2e/support/e2e-runtime';

export async function platform(): Promise<string> {
  // The UI reference captures can name another platform (for example "macos") for the update check.
  return getE2eRuntime()?.state.platform ?? 'linux';
}

export async function arch(): Promise<string> {
  return 'x86_64';
}

export async function version(): Promise<string> {
  return '6.0.0';
}

export async function type(): Promise<string> {
  return 'Linux';
}

export async function locale(): Promise<string | null> {
  return 'en-US';
}

export async function hostname(): Promise<string | null> {
  return 'playwright-host';
}
