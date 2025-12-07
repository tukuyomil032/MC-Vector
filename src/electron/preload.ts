import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // --- System Info ---
  getPlatform: () => process.platform,

  // --- Server Operations ---
  startServer: (serverId: string) => ipcRenderer.send('start-server', serverId),
  stopServer: (serverId: string) => ipcRenderer.send('stop-server', serverId),
  sendCommand: (serverId: string, command: string) => ipcRenderer.send('send-command', { serverId, command }),

  // --- Server Management ---
  getServers: () => ipcRenderer.invoke('get-servers'),
  addServer: (serverData: any) => ipcRenderer.invoke('add-server', serverData),
  updateServer: (server: any) => ipcRenderer.invoke('update-server', server),
  deleteServer: (id: string) => ipcRenderer.invoke('delete-server', id),

  // --- Download ---
  downloadServerJar: (serverId: string) => ipcRenderer.invoke('download-server-jar', serverId),

  // --- Root Directory Management ---
  getServerRoot: () => ipcRenderer.invoke('get-server-root'),
  selectRootFolder: () => ipcRenderer.invoke('select-root-folder'),

  // --- Logs, Progress, Stats ---
  onServerLog: (callback: (event: unknown, log: string) => void) => {
    const subscription = (_event: unknown, log: string) => callback(_event, log);
    ipcRenderer.on('server-log', subscription);
    return () => { ipcRenderer.removeListener('server-log', subscription); };
  },
  onDownloadProgress: (callback: (event: unknown, data: any) => void) =>
    ipcRenderer.on('download-progress', callback),
  onServerStats: (callback: (event: unknown, data: any) => void) => {
    const subscription = (_event: unknown, data: any) => callback(_event, data);
    ipcRenderer.on('server-stats', subscription);
    return () => { ipcRenderer.removeListener('server-stats', subscription); };
  },
  onServerStatusUpdate: (callback: (event: unknown, data: any) => void) => {
    const subscription = (_event: unknown, data: any) => callback(_event, data);
    ipcRenderer.on('server-status-update', subscription);
    return () => { ipcRenderer.removeListener('server-status-update', subscription); };
  },

  // --- Settings Window ---
  openSettingsWindow: (currentSettings: any) => ipcRenderer.send('open-settings-window', currentSettings),
  settingsWindowReady: () => ipcRenderer.send('settings-window-ready'),
  onSettingsData: (callback: (data: any) => void) => {
    const subscription = (_event: unknown, data: any) => callback(data);
    ipcRenderer.on('init-settings-data', subscription);
    return () => ipcRenderer.removeListener('init-settings-data', subscription);
  },
  saveSettingsFromWindow: (newSettings: any) => ipcRenderer.send('save-settings-from-window', newSettings),
  onSettingsSavedInWindow: (callback: (event: unknown, newSettings: any) => void) => {
    ipcRenderer.on('settings-updated', callback);
    return () => { ipcRenderer.removeListener('settings-updated', callback); };
  },

  // --- File Manager ---
  listFiles: (dirPath: string) => ipcRenderer.invoke('list-files', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath: string, content: string) => ipcRenderer.invoke('save-file', filePath, content),

  createDirectory: (path: string) => ipcRenderer.invoke('create-directory', path),
  deletePath: (path: string) => ipcRenderer.invoke('delete-path', path),
  movePath: (src: string, dest: string) => ipcRenderer.invoke('move-path', src, dest),
  uploadFiles: (files: string[], dest: string) => ipcRenderer.invoke('upload-files', files, dest),
  compressFiles: (files: string[], dest: string) => ipcRenderer.invoke('compress-files', files, dest),
  extractArchive: (archive: string, dest: string) => ipcRenderer.invoke('extract-archive', archive, dest),

  // ★これが必要でした（場所を開く機能）
  openPathInExplorer: (path: string) => ipcRenderer.invoke('open-path-in-explorer', path),

  // --- Backups ---
  createBackup: (serverId: string, serverPath: string) => ipcRenderer.invoke('create-backup', serverId, serverPath),
  listBackups: (serverPath: string) => ipcRenderer.invoke('list-backups', serverPath),
  restoreBackup: (serverPath: string, backupName: string) => ipcRenderer.invoke('restore-backup', serverPath, backupName),
  deleteBackup: (serverPath: string, backupName: string) => ipcRenderer.invoke('delete-backup', serverPath, backupName),

  // --- Proxy ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setupProxy: (config: any) => ipcRenderer.invoke('setup-proxy', config),
  openProxyHelpWindow: () => ipcRenderer.send('open-proxy-help-window'),

  // --- Mod/Plugin Browser ---
  searchModrinth: (query: string, type: 'mod' | 'plugin', version: string, offset: number) =>
    ipcRenderer.invoke('search-modrinth', query, type, version, offset),
  installModrinthProject: (projectId: string, versionId: string, fileName: string, downloadUrl: string, serverPath: string, type: 'mod' | 'plugin') =>
    ipcRenderer.invoke('install-modrinth-project', projectId, versionId, fileName, downloadUrl, serverPath, type),

  searchHangar: (query: string, version: string, offset: number) =>
    ipcRenderer.invoke('search-hangar', query, version, offset),
  installHangarProject: (downloadUrl: string, fileName: string, serverPath: string) =>
    ipcRenderer.invoke('install-hangar-project', downloadUrl, fileName, serverPath),

  // --- Java Manager ---
  getJavaVersions: () => ipcRenderer.invoke('get-java-versions'),
  downloadJava: (version: number) => ipcRenderer.invoke('download-java', version),
  deleteJava: (version: number) => ipcRenderer.invoke('delete-java', version),

  // --- Users ---
  readJsonFile: (filePath: string) => ipcRenderer.invoke('read-json-file', filePath),
  writeJsonFile: (filePath: string, data: any[]) => ipcRenderer.invoke('write-json-file', filePath, data),

  toggleNgrok: (serverId: string, enabled: boolean, token?: string) => ipcRenderer.invoke('toggle-ngrok', serverId, enabled, token),
  onNgrokInfo: (callback: (event: unknown, data: any) => void) => {
    const subscription = (_event: unknown, data: any) => callback(_event, data);
    ipcRenderer.on('ngrok-info', subscription);
    return () => { ipcRenderer.removeListener('ngrok-info', subscription); };
  },
  getNgrokToken: () => ipcRenderer.invoke('get-ngrok-token'),
})