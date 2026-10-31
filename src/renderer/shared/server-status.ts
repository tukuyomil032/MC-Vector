import type { ServerStatus } from './server declaration';

/**
 * A stopped or crashed server can be started. The main header, the command palette, the global shortcut
 * and bulk start all ask this one predicate, so they never disagree about when Start is allowed.
 */
export function canStartServer(status: ServerStatus | undefined): boolean {
  return status === 'offline' || status === 'crashed';
}
