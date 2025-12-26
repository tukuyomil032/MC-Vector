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
  getAppSettings: () => Promise<{ theme: 'dark' | 'darkBlue' | 'grey' | 'system' }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSettingsData: (callback: (data: any) => void) => () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveSettingsFromWindow: (newSettings: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSettingsSavedInWindow: (callback: (event: unknown, newSettings: any) => void) => void;

  // --- File Manager ---
  listFiles: (dirPath: string, serverId?: string) => Promise<{ name: string; isDirectory: boolean; size?: number }[]>;
  readFile: (filePath: string, serverId?: string) => Promise<string>;
  saveFile: (filePath: string, content: string, serverId?: string) => Promise<boolean>;
  importFilesDialog: (destDir: string, serverId: string) => Promise<{ success: boolean; message: string }>;

  createDirectory: (path: string, serverId?: string) => Promise<boolean>;
  deletePath: (path: string, serverId?: string) => Promise<boolean>;
  movePath: (srcPath: string, destPath: string, serverId?: string) => Promise<boolean>;
  uploadFiles: (filePaths: string[], destDir: string, serverId?: string) => Promise<boolean>;
  compressFiles: (paths: string[], destPath: string, serverId: string) => Promise<boolean>;
  extractArchive: (archivePath: string, destPath: string, serverId: string) => Promise<boolean>;
  openPathInExplorer: (path: string, serverId?: string) => Promise<void>;

  // --- Backups ---
  createBackup: (serverId: string, options?: { name?: string; paths?: string[]; compressionLevel?: number }) => Promise<boolean>;
  listBackups: (serverId: string) => Promise<{ name: string; date: Date; size: number }[]>;
  restoreBackup: (serverId: string, backupName: string) => Promise<boolean>;
  deleteBackup: (serverId: string, backupName: string) => Promise<boolean>;

  // --- Proxy ---
  setupProxy: (config: ProxyNetworkConfig) => Promise<{ success: boolean; message: string }>;
  openProxyHelpWindow: () => void;

  // --- Mod/Plugin Browser ---
  searchModrinth: (query: string, type: 'mod' | 'plugin', version: string, offset: number) => Promise<any[]>;
  installModrinthProject: (projectId: string, versionId: string, fileName: string, downloadUrl: string, serverId: string, type: 'mod' | 'plugin') => Promise<boolean>;

  // Hangar API
  searchHangar: (query: string, version: string, offset: number) => Promise<any[]>;
  installHangarProject: (downloadUrl: string, fileName: string, serverId: string) => Promise<boolean>;

  // --- Java Manager ---
  getJavaVersions: () => Promise<{ name: string, path: string, version: number }[]>;
  downloadJava: (version: number) => Promise<boolean>;
  selectJavaBinary: () => Promise<string | null>;
  deleteJava: (version: number) => Promise<boolean>;

  // --- Users ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readJsonFile: (filePath: string, serverId: string) => Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  writeJsonFile: (filePath: string, data: any[], serverId: string) => Promise<boolean>;

  // ngrok (Public Access)
  toggleNgrok: (serverId: string, enabled: boolean, token?: string) => Promise<{ success: boolean, message?: string }>;
  onNgrokInfo: (callback: (event: unknown, data: { serverId: string, url?: string, log?: string, status: 'running' | 'stopped' | 'error' | 'downloading' }) => void) => (() => void);
  hasNgrokToken: () => Promise<boolean>;
  clearNgrokToken: () => Promise<boolean>;
  getNgrokStatus: (serverId: string) => Promise<{ active: boolean, url: string | null, logs?: string[]}>;
  openNgrokGuide: () => void;

  // Updates
  checkForUpdates: () => Promise<{ available?: boolean; version?: string; releaseNotes?: unknown; error?: string }>;
  downloadUpdate: () => Promise<boolean>;
  installUpdate: () => Promise<boolean>;
  onUpdateAvailable: (callback: (payload: { version?: string; releaseNotes?: unknown }) => void) => (() => void);
  onUpdateAvailableSilent: (callback: (payload: { version?: string; releaseNotes?: unknown }) => void) => (() => void);
  onUpdateNotAvailable: (callback: () => void) => (() => void);
  onUpdateDownloadProgress: (callback: (payload: { percent: number }) => void) => (() => void);
  onUpdateDownloaded: (callback: (payload: { version?: string; releaseNotes?: unknown }) => void) => (() => void);
  onUpdateError: (callback: (message: string) => void) => (() => void);
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}