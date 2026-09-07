import { tauriInvoke } from './tauri-api';

export interface ServerEulaStatus {
  accepted: boolean;
  fileExists: boolean;
}

export function getServerEulaStatus(serverId: string): Promise<ServerEulaStatus> {
  return tauriInvoke<ServerEulaStatus>('get_server_eula_status', { serverId });
}

export function acceptServerEula(serverId: string): Promise<void> {
  return tauriInvoke('accept_server_eula', { serverId });
}

export function isEulaRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('eula-required');
}
