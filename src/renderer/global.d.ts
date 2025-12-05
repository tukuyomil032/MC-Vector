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

  // --- ログ・進捗 ---
  // ★修正: 戻り値を (() => void) に変更 (解除関数を受け取るため)
  onServerLog: (callback: (event: unknown, log: string) => void) => (() => void);
  
  onDownloadProgress: (callback: (event: unknown, data: { serverId: string, progress: number, status: string }) => void) => void;

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
  
  // ファイル操作
  createDirectory: (path: string) => Promise<boolean>;
  deletePath: (path: string) => Promise<boolean>;
  movePath: (srcPath: string, destPath: string) => Promise<boolean>;
  copyPath: (srcPath: string, destPath: string) => Promise<boolean>; // 将来用
  compressFiles: (paths: string[], destPath: string) => Promise<boolean>; // tar.gz作成
  extractArchive: (archivePath: string, destPath: string) => Promise<boolean>; // 解凍
  
  // ファイルアップロード用（メインプロセス側でダイアログを開くのではなく、パスを受け取ってコピーする）
  uploadFiles: (filePaths: string[], destDir: string) => Promise<boolean>;


  // --- バックアップ ---
  createBackup: (serverId: string, serverPath: string) => Promise<boolean>;
  listBackups: (serverPath: string) => Promise<{ name: string; date: Date; size: number }[]>;
  restoreBackup: (serverPath: string, backupName: string) => Promise<boolean>;
  deleteBackup: (serverPath: string, backupName: string) => Promise<boolean>;

  // --- プロキシ ---
  setupProxy: (config: ProxyNetworkConfig) => Promise<{ success: boolean; message: string }>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}