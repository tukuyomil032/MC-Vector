"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  getPlatform: () => process.platform,
  startServer: (serverId) => electron.ipcRenderer.send("start-server", serverId),
  stopServer: (serverId) => electron.ipcRenderer.send("stop-server", serverId),
  sendCommand: (serverId, command) => electron.ipcRenderer.send("send-command", { serverId, command }),
  getServers: () => electron.ipcRenderer.invoke("get-servers"),
  addServer: (serverData) => electron.ipcRenderer.invoke("add-server", serverData),
  updateServer: (server) => electron.ipcRenderer.invoke("update-server", server),
  deleteServer: (id) => electron.ipcRenderer.invoke("delete-server", id),
  downloadServerJar: (serverId) => electron.ipcRenderer.invoke("download-server-jar", serverId),
  getServerRoot: () => electron.ipcRenderer.invoke("get-server-root"),
  selectRootFolder: () => electron.ipcRenderer.invoke("select-root-folder"),
  onServerLog: (callback) => {
    const subscription = (_event, log) => callback(_event, log);
    electron.ipcRenderer.on("server-log", subscription);
    return () => {
      electron.ipcRenderer.removeListener("server-log", subscription);
    };
  },
  onDownloadProgress: (callback) => electron.ipcRenderer.on("download-progress", callback),
  openSettingsWindow: (currentSettings) => electron.ipcRenderer.send("open-settings-window", currentSettings),
  settingsWindowReady: () => electron.ipcRenderer.send("settings-window-ready"),
  onSettingsData: (callback) => {
    const subscription = (_event, data) => callback(data);
    electron.ipcRenderer.on("init-settings-data", subscription);
    return () => electron.ipcRenderer.removeListener("init-settings-data", subscription);
  },
  saveSettingsFromWindow: (newSettings) => electron.ipcRenderer.send("save-settings-from-window", newSettings),
  onSettingsSavedInWindow: (callback) => {
    electron.ipcRenderer.on("settings-updated", callback);
    return () => {
      electron.ipcRenderer.removeListener("settings-updated", callback);
    };
  },
  listFiles: (dirPath) => electron.ipcRenderer.invoke("list-files", dirPath),
  readFile: (filePath) => electron.ipcRenderer.invoke("read-file", filePath),
  saveFile: (filePath, content) => electron.ipcRenderer.invoke("save-file", filePath, content),
  // ★新規API
  createDirectory: (path) => electron.ipcRenderer.invoke("create-directory", path),
  deletePath: (path) => electron.ipcRenderer.invoke("delete-path", path),
  movePath: (src, dest) => electron.ipcRenderer.invoke("move-path", src, dest),
  uploadFiles: (files, dest) => electron.ipcRenderer.invoke("upload-files", files, dest),
  compressFiles: (files, dest) => electron.ipcRenderer.invoke("compress-files", files, dest),
  extractArchive: (archive, dest) => electron.ipcRenderer.invoke("extract-archive", archive, dest),
  createBackup: (serverId, serverPath) => electron.ipcRenderer.invoke("create-backup", serverId, serverPath),
  listBackups: (serverPath) => electron.ipcRenderer.invoke("list-backups", serverPath),
  restoreBackup: (serverPath, backupName) => electron.ipcRenderer.invoke("restore-backup", serverPath, backupName),
  deleteBackup: (serverPath, backupName) => electron.ipcRenderer.invoke("delete-backup", serverPath, backupName),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setupProxy: (config) => electron.ipcRenderer.invoke("setup-proxy", config)
});
