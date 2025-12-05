import { ProxyNetworkConfig } from './renderer/components/ProxySetupView';

export interface IElectronAPI {
  // --- システム情報 ---
  getPlatform: () => Promise<string>;

  // --- サーバー操作 ---
  startServer: (id: string) => Promise<void>;
  stopServer: (id: string) => Promise<void>;
  sendCommand: (id: string, command: string) => Promise<void>;

  // --- サーバー管理 ---
  getServers: () => Promise<any[]>;
  addServer: (serverData: any) => Promise<any>;
  updateServer: (server: any) => Promise<boolean>;
  deleteServer: (id: string) => Promise<boolean>;

  // --- ダウンロード ---
  downloadServerJar: (serverId: string) => Promise<boolean>;

  // --- ルートディレクトリ管理 ---
  getServerRoot: () => Promise<string>;
  selectRootFolder: () => Promise<string | null>;

  // --- ログ・進捗・統計 ---
  onServerLog: (callback: (event: unknown, log: string) => void) => (() => void);
  onDownloadProgress: (callback: (event: unknown, data: { serverId: string, progress: number, status: string }) => void) => void;
  onServerStats: (callback: (event: unknown, data: { serverId: string, cpu: number, memory: number }) => void) => (() => void);
  onServerStatusUpdate: (callback: (event: unknown, data: { serverId: string, status: string }) => void) => (() => void);

  // --- 設定ウィンドウ ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openSettingsWindow: (currentSettings: any) => void;
  settingsWindowReady: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSettingsData: (callback: (data: any) => void) => () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveSettingsFromWindow: (newSettings: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSettingsSavedInWindow: (callback: (event: unknown, newSettings: any) => void) => void;

  // --- ファイルマネージャー ---
  listFiles: (dirPath: string) => Promise<{ name: string; isDirectory: boolean; size?: number }[]>;
  readFile: (filePath: string) => Promise<string>;
  saveFile: (filePath: string, content: string) => Promise<boolean>;

  createDirectory: (path: string) => Promise<boolean>;
  deletePath: (path: string) => Promise<boolean>;
  movePath: (srcPath: string, destPath: string) => Promise<boolean>;
  uploadFiles: (filePaths: string[], destDir: string) => Promise<boolean>;
  compressFiles: (paths: string[], destPath: string) => Promise<boolean>;
  extractArchive: (archivePath: string, destPath: string) => Promise<boolean>;

  // --- バックアップ ---
  createBackup: (serverId: string, serverPath: string) => Promise<boolean>;
  listBackups: (serverPath: string) => Promise<{ name: string; date: Date; size: number }[]>;
  restoreBackup: (serverPath: string, backupName: string) => Promise<boolean>;
  deleteBackup: (serverPath: string, backupName: string) => Promise<boolean>;

  // --- プロキシ ---
  setupProxy: (config: ProxyNetworkConfig) => Promise<{ success: boolean; message: string }>;

  // --- Mod/Pluginブラウザ ---
  searchModrinth: (query: string, type: 'mod' | 'plugin', version: string, offset: number) => Promise<any[]>;
  installModrinthProject: (projectId: string, versionId: string, fileName: string, downloadUrl: string, serverPath: string, type: 'mod' | 'plugin') => Promise<boolean>;

  // Hangar API
  searchHangar: (query: string, version: string, offset: number) => Promise<any[]>;
  installHangarProject: (downloadUrl: string, fileName: string, serverPath: string) => Promise<boolean>;

  // ★追加: Java Manager API
  getJavaVersions: () => Promise<{ name: string, path: string, version: number }[]>;
  downloadJava: (version: number) => Promise<boolean>;
  deleteJava: (version: number) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}