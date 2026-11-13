import { getE2eRuntime } from '../e2e/support/e2e-runtime';

export async function relaunch(): Promise<void> {
  // The UI reference captures set updater.relaunchError to reach the restart-failure toast. Unset in E2E scenarios.
  const message = getE2eRuntime()?.state.updater?.relaunchError;
  if (message !== undefined) throw new Error(message);
}

export async function exit(_exitCode?: number): Promise<void> {}
