import { ProxyNetworkConfig } from './renderer/components/ProxySetupView';

export interface IElectronAPI {
  // --- System Info ---
  getPlatform: () => Promise<string>;

  // --- Server Operations ---
  startServer: (id: string) => Promise<void>;
  stopServer: (id: string) => Promise<void>;
  sendCommand: (id: string, command: string) => Promise<void>;

  // --- Server Management ---
  getServers: () => Promise<any[]>;
  addServer: (serverData: any) => Promise<any>;
  updateServer: (server: any) => Promise<boolean>;
  deleteServer: (id: string) => Promise<boolean>;

  // --- Download ---
  downloadServerJar: (serverId: string) => Promise<boolean>;

  // --- Root Directory Management ---
  getServerRoot: () => Promise<string>;
  selectRootFolder: () => Promise<string | null>;

  // --- Logs, Progress, Stats ---
  onServerLog: (callback: (event: unknown, log: string) => void) => (() => void);
  onDownloadProgress: (callback: (event: unknown, data: { serverId: string, progress: number, status: string }) => void) => void;
  onServerStats: (callback: (event: unknown, data: { serverId: string, cpu: number, memory: number }) => void) => (() => void);
  onServerStatusUpdate: (callback: (event: unknown, data: { serverId: string, status: string }) => void) => (() => void);

  // --- Settings Window ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openSettingsWindow: (currentSettings: any) => void;
  settingsWindowReady: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSettingsData: (callback: (data: any) => void) => () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveSettingsFromWindow: (newSettings: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSettingsSavedInWindow: (callback: (event: unknown, newSettings: any) => void) => void;

  // --- File Manager ---
  listFiles: (dirPath: string) => Promise<{ name: string; isDirectory: boolean; size?: number }[]>;
  readFile: (filePath: string) => Promise<string>;
  saveFile: (filePath: string, content: string) => Promise<boolean>;
  importFilesDialog: (destDir: string) => Promise<{ success: boolean; message: string }>;

  createDirectory: (path: string) => Promise<boolean>;
  deletePath: (path: string) => Promise<boolean>;
  movePath: (srcPath: string, destPath: string) => Promise<boolean>;
  uploadFiles: (filePaths: string[], destDir: string) => Promise<boolean>;
  compressFiles: (paths: string[], destPath: string) => Promise<boolean>;
  extractArchive: (archivePath: string, destPath: string) => Promise<boolean>;
  openPathInExplorer: (path: string) => Promise<void>;

  // --- Backups ---
  createBackup: (serverId: string, serverPath: string) => Promise<boolean>;
  listBackups: (serverPath: string) => Promise<{ name: string; date: Date; size: number }[]>;
  restoreBackup: (serverPath: string, backupName: string) => Promise<boolean>;
  deleteBackup: (serverPath: string, backupName: string) => Promise<boolean>;

  // --- Proxy ---
  setupProxy: (config: ProxyNetworkConfig) => Promise<{ success: boolean; message: string }>;
  openProxyHelpWindow: () => void;

  // --- Mod/Plugin Browser ---
  searchModrinth: (query: string, type: 'mod' | 'plugin', version: string, offset: number) => Promise<any[]>;
  installModrinthProject: (projectId: string, versionId: string, fileName: string, downloadUrl: string, serverPath: string, type: 'mod' | 'plugin') => Promise<boolean>;

  // Hangar API
  searchHangar: (query: string, version: string, offset: number) => Promise<any[]>;
  installHangarProject: (downloadUrl: string, fileName: string, serverPath: string) => Promise<boolean>;

  // --- Java Manager ---
  getJavaVersions: () => Promise<{ name: string, path: string, version: number }[]>;
  downloadJava: (version: number) => Promise<boolean>;
  deleteJava: (version: number) => Promise<boolean>;

  // --- Users ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readJsonFile: (filePath: string) => Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  writeJsonFile: (filePath: string, data: any[]) => Promise<boolean>;

  // ngrok (Public Access)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toggleNgrok: (serverId: string, enabled: boolean, token?: string) => Promise<{ success: boolean, message?: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNgrokInfo: (callback: (event: unknown, data: { serverId: string, url?: string, log?: string, status: 'running' | 'stopped' | 'error' | 'downloading' }) => void) => (() => void);
  getNgrokToken: () => Promise<string>;
  getNgrokStatus: (serverId: string) => Promise<{ active: boolean, url: string | null, logs?: string[]}>;
  openNgrokGuide: () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}