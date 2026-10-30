import type { MinecraftServer } from '../renderer/shared/server declaration';
import { type UnlistenFn, tauriInvoke, tauriListen } from './tauri-api';

export interface NewServerProfileRequest {
  operationId: string;
  name: string;
  profileName?: string;
  groupName?: string;
  version: string;
  software: string;
  port: number;
  memoryGb: number;
  javaPath?: string;
  autoRestartOnCrash?: boolean;
  maxAutoRestarts?: number;
  autoRestartDelaySec?: number;
  autoBackupEnabled?: boolean;
  autoBackupIntervalMin?: number;
  autoBackupScheduleType?: 'interval' | 'daily' | 'weekly';
  autoBackupTime?: string;
  autoBackupWeekday?: number;
  autoBackupRetainCount?: number;
  autoBackupRetainDays?: number;
  backupRestartAfterSafeBackup?: boolean;
  jvmArgs?: string;
  notifyOnCrash?: boolean;
  notifyOnStart?: boolean;
  notifyOnHighCpu?: boolean;
  notifyHighCpuThreshold?: number;
  importToken?: string;
}

export interface CreatedServerProfile {
  server: MinecraftServer;
  jarInstalled: boolean;
}

export interface ServerCreationProgress {
  operationId: string;
  progress: number;
  status: string;
}

export function createServerProfile(
  request: NewServerProfileRequest,
): Promise<CreatedServerProfile> {
  return tauriInvoke<CreatedServerProfile>('create_server_profile', { request });
}

export function onServerCreationProgress(
  callback: (progress: ServerCreationProgress) => void,
): Promise<UnlistenFn> {
  return tauriListen('server-creation-download-progress', callback);
}
