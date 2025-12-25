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
  listFiles: (dirPath: string, serverId?: string) => ipcRenderer.invoke('list-files', dirPath, serverId),
  readFile: (filePath: string, serverId?: string) => ipcRenderer.invoke('read-file', filePath, serverId),
  saveFile: (filePath: string, content: string, serverId?: string) => ipcRenderer.invoke('save-file', filePath, content, serverId),
  importFilesDialog: (destDir: string, serverId: string) => ipcRenderer.invoke('import-files-dialog', destDir, serverId),

  createDirectory: (path: string, serverId?: string) => ipcRenderer.invoke('create-directory', path, serverId),
  deletePath: (path: string, serverId?: string) => ipcRenderer.invoke('delete-path', path, serverId),
  movePath: (src: string, dest: string, serverId?: string) => ipcRenderer.invoke('move-path', src, dest, serverId),
  uploadFiles: (files: string[], dest: string, serverId?: string) => ipcRenderer.invoke('upload-files', files, dest, serverId),
  compressFiles: (files: string[], dest: string, serverId: string) => ipcRenderer.invoke('compress-files', files, dest, serverId),
  extractArchive: (archive: string, dest: string, serverId: string) => ipcRenderer.invoke('extract-archive', archive, dest, serverId),

  // Reveal in Finder / Explorer
  openPathInExplorer: (path: string, serverId?: string) => ipcRenderer.invoke('open-path-in-explorer', path, serverId),

  // --- Backups ---
  createBackup: (serverId: string, options?: { name?: string; paths?: string[]; compressionLevel?: number }) => ipcRenderer.invoke('create-backup', serverId, options),
  listBackups: (serverId: string) => ipcRenderer.invoke('list-backups', serverId),
  restoreBackup: (serverId: string, backupName: string) => ipcRenderer.invoke('restore-backup', serverId, backupName),
  deleteBackup: (serverId: string, backupName: string) => ipcRenderer.invoke('delete-backup', serverId, backupName),

  // --- Proxy ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setupProxy: (config: any) => ipcRenderer.invoke('setup-proxy', config),
  openProxyHelpWindow: () => ipcRenderer.send('open-proxy-help-window'),

  // --- Mod/Plugin Browser ---
  searchModrinth: (query: string, type: 'mod' | 'plugin', version: string, offset: number) =>
    ipcRenderer.invoke('search-modrinth', query, type, version, offset),
  installModrinthProject: (projectId: string, versionId: string, fileName: string, downloadUrl: string, serverId: string, type: 'mod' | 'plugin') =>
    ipcRenderer.invoke('install-modrinth-project', projectId, versionId, fileName, downloadUrl, serverId, type),

  searchHangar: (query: string, version: string, offset: number) =>
    ipcRenderer.invoke('search-hangar', query, version, offset),
  installHangarProject: (downloadUrl: string, fileName: string, serverId: string) =>
    ipcRenderer.invoke('install-hangar-project', downloadUrl, fileName, serverId),

  // --- Java Manager ---
  getJavaVersions: () => ipcRenderer.invoke('get-java-versions'),
  downloadJava: (version: number) => ipcRenderer.invoke('download-java', version),
  selectJavaBinary: () => ipcRenderer.invoke('select-java-binary'),
  deleteJava: (version: number) => ipcRenderer.invoke('delete-java', version),

  // --- Users ---
  readJsonFile: (filePath: string, serverId: string) => ipcRenderer.invoke('read-json-file', filePath, serverId),
  writeJsonFile: (filePath: string, data: any[], serverId: string) => ipcRenderer.invoke('write-json-file', filePath, data, serverId),

  toggleNgrok: (serverId: string, enabled: boolean, token?: string) => ipcRenderer.invoke('toggle-ngrok', serverId, enabled, token),
  onNgrokInfo: (callback: (event: unknown, data: any) => void) => {
    const subscription = (_event: unknown, data: any) => callback(_event, data);
    ipcRenderer.on('ngrok-info', subscription);
    return () => { ipcRenderer.removeListener('ngrok-info', subscription); };
  },
  hasNgrokToken: () => ipcRenderer.invoke('has-ngrok-token'),
  clearNgrokToken: () => ipcRenderer.invoke('clear-ngrok-token'),
  getNgrokStatus: (serverId: string) => ipcRenderer.invoke('get-ngrok-status', serverId),
  openNgrokGuide: () => ipcRenderer.send('open-ngrok-guide'),
})