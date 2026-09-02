import { recordE2eCall } from '../e2e/support/e2e-runtime';

type E2eWindow = Window & { __openerFail?: boolean };

export async function openUrl(url: string): Promise<void> {
  recordE2eCall('opener', 'openUrl', { url });
  if ((window as E2eWindow).__openerFail === true) {
    throw new Error('E2E opener failure');
  }
}

export async function openPath(path: string): Promise<void> {
  recordE2eCall('opener', 'openPath', { path });
}

export async function revealItemInDir(path: string): Promise<void> {
  recordE2eCall('opener', 'revealItemInDir', { path });
}
