import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getPlatform: () => process.platform,
  startServer: (serverId: string) => ipcRenderer.send('start-server', serverId),
  stopServer: (serverId: string) => ipcRenderer.send('stop-server', serverId),
  sendCommand: (serverId: string, command: string) => ipcRenderer.send('send-command', { serverId, command }),

  getServers: () => ipcRenderer.invoke('get-servers'),
  addServer: (serverData: any) => ipcRenderer.invoke('add-server', serverData),
  updateServer: (server: any) => ipcRenderer.invoke('update-server', server),
  deleteServer: (id: string) => ipcRenderer.invoke('delete-server', id),

  downloadServerJar: (serverId: string) => ipcRenderer.invoke('download-server-jar', serverId),

  getServerRoot: () => ipcRenderer.invoke('get-server-root'),
  selectRootFolder: () => ipcRenderer.invoke('select-root-folder'),

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

  listFiles: (dirPath: string) => ipcRenderer.invoke('list-files', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath: string, content: string) => ipcRenderer.invoke('save-file', filePath, content),

  createDirectory: (path: string) => ipcRenderer.invoke('create-directory', path),
  deletePath: (path: string) => ipcRenderer.invoke('delete-path', path),
  movePath: (src: string, dest: string) => ipcRenderer.invoke('move-path', src, dest),
  uploadFiles: (files: string[], dest: string) => ipcRenderer.invoke('upload-files', files, dest),
  compressFiles: (files: string[], dest: string) => ipcRenderer.invoke('compress-files', files, dest),
  extractArchive: (archive: string, dest: string) => ipcRenderer.invoke('extract-archive', archive, dest),

  createBackup: (serverId: string, serverPath: string) => ipcRenderer.invoke('create-backup', serverId, serverPath),
  listBackups: (serverPath: string) => ipcRenderer.invoke('list-backups', serverPath),
  restoreBackup: (serverPath: string, backupName: string) => ipcRenderer.invoke('restore-backup', serverPath, backupName),
  deleteBackup: (serverPath: string, backupName: string) => ipcRenderer.invoke('delete-backup', serverPath, backupName),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setupProxy: (config: any) => ipcRenderer.invoke('setup-proxy', config),

  searchModrinth: (query: string, type: 'mod' | 'plugin', version: string, offset: number) =>
    ipcRenderer.invoke('search-modrinth', query, type, version, offset),
  installModrinthProject: (projectId: string, versionId: string, fileName: string, downloadUrl: string, serverPath: string, type: 'mod' | 'plugin') =>
    ipcRenderer.invoke('install-modrinth-project', projectId, versionId, fileName, downloadUrl, serverPath, type),

  searchHangar: (query: string, version: string, offset: number) =>
    ipcRenderer.invoke('search-hangar', query, version, offset),
  installHangarProject: (downloadUrl: string, fileName: string, serverPath: string) =>
    ipcRenderer.invoke('install-hangar-project', downloadUrl, fileName, serverPath),

  // ★追加
  getJavaVersions: () => ipcRenderer.invoke('get-java-versions'),
  downloadJava: (version: number) => ipcRenderer.invoke('download-java', version),
  deleteJava: (version: number) => ipcRenderer.invoke('delete-java', version),
})