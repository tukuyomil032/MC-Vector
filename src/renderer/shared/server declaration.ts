export type ServerStatus = 'online' | 'offline' | 'starting' | 'stopping';

export type AppView = 'console' | 'properties' | 'proxy' | 'files' | 'backups' | 'general-settings' | 'sftp' | 'users';

export interface MinecraftServer {
    id: string;
    name: string;
    version: string;
    path: string;
    port: number;
    status: ServerStatus;
    memory: number;
}