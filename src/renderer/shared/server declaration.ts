// ★修正: 'restarting' を追加
export type ServerStatus = 'online' | 'offline' | 'starting' | 'stopping' | 'restarting';

export interface MinecraftServer {
  id: string;
  name: string;
  version: string;
  software: string; // 'Paper', 'Fabric' etc.
  port: number;
  memory: number;
  path: string;
  status: ServerStatus;
  javaPath?: string; // オプショナル
  createdDate?: string;
}

export type AppView = 'dashboard' | 'console' | 'properties' | 'files' | 'plugins' | 'backups' | 'general-settings' | 'proxy' | 'users';