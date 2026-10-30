import type { MinecraftServer } from '../renderer/shared/server declaration';
import { tauriInvoke } from './tauri-api';

export function cloneServerProfile(sourceServerId: string, name: string): Promise<MinecraftServer> {
  return tauriInvoke<MinecraftServer>('clone_server_profile', { sourceServerId, name });
}

export function deleteManagedServer(serverId: string): Promise<boolean> {
  return tauriInvoke<boolean>('delete_managed_server', { serverId });
}
