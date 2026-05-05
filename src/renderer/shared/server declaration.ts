export type ServerStatus =
  | 'online'
  | 'offline'
  | 'starting'
  | 'stopping'
  | 'restarting'
  | 'crashed';

export interface MinecraftServer {
  id: string;
  name: string;
  profileName?: string;
  groupName?: string;
  version: string;
  software: string;
  port: number;
  memory: number;
  path: string;
  status: ServerStatus;
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
  createdDate?: string;
  jvmArgs?: string;
}

export type AppView =
  | 'dashboard'
  | 'console'
  | 'properties'
  | 'files'
  | 'plugins'
  | 'backups'
  | 'general-settings'
  | 'app-settings'
  | 'proxy'
  | 'proxy-help'
  | 'ngrok-guide'
  | 'users';
