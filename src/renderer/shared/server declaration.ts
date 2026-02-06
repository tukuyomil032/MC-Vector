export type ServerStatus = 'online' | 'offline' | 'starting' | 'stopping' | 'restarting';

export interface MinecraftServer {
  id: string;
  name: string;
  version: string;
  software: string;
  port: number;
  memory: number;
  path: string;
  status: ServerStatus;
  javaPath?: string;
  createdDate?: string;
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
