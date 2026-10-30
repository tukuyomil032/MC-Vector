import { type UnlistenFn, tauriInvoke, tauriListen } from './tauri-api';

export interface ServerAutomationEvent {
  kind:
    | 'auto_restart_scheduled'
    | 'auto_restart_limit_reached'
    | 'auto_restart_failed'
    | 'auto_restart_eula_required'
    | 'auto_backup_created'
    | 'auto_backup_failed'
    | 'auto_backup_retention_delete_failed'
    | 'auto_backup_retention_list_failed';
  serverId: string;
  serverName: string;
  seconds?: number;
  attempt?: number;
  max?: number;
  count?: number;
  catalogError?: string;
}

export function cancelAutoRestart(serverId: string, resetAttempts = false): Promise<void> {
  return tauriInvoke('cancel_auto_restart', { serverId, resetAttempts });
}

export function resumeAutoRestartAfterEula(serverId: string): Promise<void> {
  return tauriInvoke('resume_auto_restart_after_eula', { serverId });
}

export function onServerAutomationEvent(
  callback: (event: ServerAutomationEvent) => void,
): Promise<UnlistenFn> {
  return tauriListen('server-automation-event', callback);
}
