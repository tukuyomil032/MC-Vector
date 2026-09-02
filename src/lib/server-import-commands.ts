import { tauriInvoke } from './tauri-api';

export interface ServerFolderAnalysis {
  token: string;
  folderName: string;
  detectedVersion: string;
  detectedSoftware: string;
  eulaAccepted: boolean;
  hasServerJar: boolean;
}

export async function pickServerImport(): Promise<ServerFolderAnalysis | null> {
  return tauriInvoke<ServerFolderAnalysis | null>('pick_server_import');
}

export async function completeServerImport(token: string, serverId: string): Promise<void> {
  await tauriInvoke('complete_server_import', { token, serverId });
}

export async function cancelServerImport(token: string): Promise<void> {
  await tauriInvoke('cancel_server_import', { token });
}
