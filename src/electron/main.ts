import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import AdmZip from 'adm-zip';
import * as tar from 'tar'; // ★追加: Mac/Linux用
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import pidusage from 'pidusage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const RUNTIMES_PATH = path.join(app.getPath('userData'), 'runtimes');

// --- Helper Functions ---

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
      console.error(e);
    }
  }
  return {};
}

function saveConfig(config: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function getServersRootDir(): string {
  const config = loadConfig();
  if (config.rootDir && fs.existsSync(config.rootDir)) {
    return config.rootDir;
  }
  const defaultPath = path.join(app.getPath('userData'), 'servers');
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
  }
  return defaultPath;
}

function getServersJsonPath(): string {
  return path.join(getServersRootDir(), 'servers.json');
}

function loadServersList() {
  const jsonPath = getServersJsonPath();
  if (!fs.existsSync(jsonPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function saveServersList(servers: any[]) {
  const root = getServersRootDir();
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  fs.writeFileSync(getServersJsonPath(), JSON.stringify(servers, null, 2), 'utf-8');
}

function readServerProperties(filePath: string): Map<string, string> {
  if (!fs.existsSync(filePath)) return new Map();
  const content = fs.readFileSync(filePath, 'utf-8');
  const properties = new Map<string, string>();
  content.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...values] = line.split('=');
      if (key) {
        properties.set(key.trim(), values.join('=').trim());
      }
    }
  });
  return properties;
}

function writeServerProperties(filePath: string, properties: Map<string, string>) {
  let content = "#Minecraft server properties\n#Edited by MC-Vector\n";
  properties.forEach((value, key) => {
    content += `${key}=${value}\n`;
  });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'MC-Vector/1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url: string, destPath: string, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { 'User-Agent': 'MC-Vector/1.0' } }, (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 302) {
        return reject(new Error(`Download failed with status code: ${res.statusCode}`));
      }
      const totalSize = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      res.pipe(file);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalSize > 0) {
          const percent = Math.round((downloaded / totalSize) * 100);
          onProgress(percent);
        }
      });
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tempSettingsData: any = null;

const activeServers = new Map<string, ChildProcess>();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 1秒ごとに稼働中サーバーのCPU/メモリ統計を取得して送信
  setInterval(async () => {
    if (activeServers.size === 0) return;

    for (const [serverId, process] of activeServers) {
      if (process && process.pid) {
        try {
          const stats = await pidusage(process.pid);
          mainWindow?.webContents.send('server-stats', {
            serverId,
            cpu: stats.cpu,
            memory: stats.memory
          });
        } catch (e) {
          // プロセス終了直後などで取得できない場合は無視
        }
      }
    }
  }, 1000);
}

app.whenReady().then(() => {
  createWindow();

  const sendLog = (sender: any, serverId: string, log: string) => {
    sender.send('server-log', { serverId, log });
  };

  const sendStatus = (serverId: string, status: string) => {
    mainWindow?.webContents.send('server-status-update', { serverId, status });
  };

  // --- IPC Handlers ---

  ipcMain.handle('get-server-root', async () => getServersRootDir());

  ipcMain.handle('select-root-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'サーバーデータの保存先を選択'
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const newPath = result.filePaths[0];
    const config = loadConfig();
    config.rootDir = newPath;
    saveConfig(config);
    return newPath;
  });

  ipcMain.handle('get-servers', async () => {
    const servers = loadServersList();
    return servers.map((s: any) => ({
      ...s,
      status: activeServers.has(s.id) ? 'online' : 'offline'
    }));
  });

  ipcMain.handle('add-server', async (_event, serverData) => {
    try {
      const id = crypto.randomUUID();
      const rootDir = getServersRootDir();
      let folderName = serverData.name.replace(/[\\/:*?"<>|]/g, "").trim();
      if (!folderName) folderName = `server-${id}`;

      let serverDir = path.join(rootDir, folderName);
      if (fs.existsSync(serverDir)) {
        serverDir = path.join(rootDir, `${folderName}-${id.substring(0, 6)}`);
      }
      if (!fs.existsSync(serverDir)) {
        fs.mkdirSync(serverDir, { recursive: true });
      }

      const propsPath = path.join(serverDir, 'server.properties');
      const props = new Map<string, string>();
      props.set('server-port', serverData.port.toString());
      props.set('motd', `A Minecraft Server - ${serverData.name}`);
      writeServerProperties(propsPath, props);

      fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n');

      const newServer = {
        id,
        name: serverData.name,
        version: serverData.version,
        software: serverData.software,
        port: serverData.port,
        memory: serverData.memory,
        path: serverDir,
        status: 'offline',
        createdDate: new Date().toISOString()
      };

      const servers = loadServersList();
      servers.push(newServer);
      saveServersList(servers);
      return newServer;
    } catch (e) {
      console.error('Failed to add server:', e);
      throw e;
    }
  });

  ipcMain.handle('update-server', async (_event, updatedServer) => {
    try {
      const servers = loadServersList();
      const index = servers.findIndex((s: any) => s.id === updatedServer.id);
      if (index !== -1) {
        servers[index] = { ...servers[index], ...updatedServer };
        saveServersList(servers);

        const propsPath = path.join(updatedServer.path, 'server.properties');
        if (fs.existsSync(propsPath)) {
          const props = readServerProperties(propsPath);
          props.set('server-port', updatedServer.port.toString());
          writeServerProperties(propsPath, props);
        }
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle('delete-server', async (_event, serverId) => {
    try {
      if (activeServers.has(serverId)) {
        const process = activeServers.get(serverId);
        process?.kill();
        activeServers.delete(serverId);
      }

      const servers = loadServersList();
      const index = servers.findIndex((s: any) => s.id === serverId);
      if (index === -1) return false;

      const serverToDelete = servers[index];
      if (serverToDelete.path && fs.existsSync(serverToDelete.path)) {
        try {
          fs.rmSync(serverToDelete.path, { recursive: true, force: true });
        } catch (e) {
          console.error(e);
        }
      }

      servers.splice(index, 1);
      saveServersList(servers);
      return true;
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle('download-server-jar', async (event, serverId) => {
    const servers = loadServersList();
    const server = servers.find((s: any) => s.id === serverId);
    if (!server) return false;

    const sender = event.sender;
    const sendProgress = (percent: number, status: string) => {
      sender.send('download-progress', { serverId, progress: percent, status });
    };

    try {
      sendProgress(0, 'URLを取得中...');
      let downloadUrl = '';
      const fileName = 'server.jar';

      if (['Paper', 'Waterfall', 'Velocity', 'LeafMC'].includes(server.software)) {
        const projectMap: {[key: string]: string} = { 'Paper': 'paper', 'Waterfall': 'waterfall', 'Velocity': 'velocity', 'LeafMC': 'leaf' };
        const projectId = projectMap[server.software] || 'paper';
        const buildListUrl = `https://api.papermc.io/v2/projects/${projectId}/versions/${server.version}`;
        try {
            const buildData = await fetchJson(buildListUrl);
            const latestBuild = buildData.builds[buildData.builds.length - 1];
            const jarName = `${projectId}-${server.version}-${latestBuild}.jar`;
            downloadUrl = `https://api.papermc.io/v2/projects/${projectId}/versions/${server.version}/builds/${latestBuild}/downloads/${jarName}`;
        } catch {
            sendProgress(0, 'API未対応。Paperとして試行...');
            const pBuildUrl = `https://api.papermc.io/v2/projects/paper/versions/${server.version}`;
            const pData = await fetchJson(pBuildUrl);
            const pBuild = pData.builds[pData.builds.length - 1];
            downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${server.version}/builds/${pBuild}/downloads/paper-${server.version}-${pBuild}.jar`;
        }
      } else if (server.software === 'Vanilla') {
        const manifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest.json');
        const versionData = manifest.versions.find((v: any) => v.id === server.version);
        if (versionData) {
          const versionDetails = await fetchJson(versionData.url);
          downloadUrl = versionDetails.downloads.server.url;
        }
      } else if (server.software === 'Fabric') {
        const loaderVersions = await fetchJson('https://meta.fabricmc.net/v2/versions/loader');
        const stableLoader = loaderVersions[0].version;
        const installerVersions = await fetchJson('https://meta.fabricmc.net/v2/versions/installer');
        const stableInstaller = installerVersions[0].version;
        downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${server.version}/${stableLoader}/${stableInstaller}/server/jar`;
      }

      if (!downloadUrl) throw new Error(`${server.software} (${server.version}) のダウンロードリンクが見つかりません。`);

      sendProgress(0, 'ダウンロード中...');
      const destPath = path.join(server.path, fileName);
      await downloadFile(downloadUrl, destPath, (percent) => sendProgress(percent, 'ダウンロード中...'));

      sendProgress(100, '完了');
      return true;
    } catch (error: any) {
      console.error('Download error:', error);
      sendProgress(0, `エラー: ${error.message}`);
      return false;
    }
  });

  ipcMain.handle('setup-proxy', async (_event, config) => {
    const { proxySoftware, proxyPort, backendServerIds } = config;
    try {
      const rootDir = getServersRootDir();
      const proxyPath = path.join(rootDir, 'Proxy-Server');
      if (!fs.existsSync(proxyPath)) fs.mkdirSync(proxyPath, { recursive: true });

      let velocityServersConfig = '[servers]\n';
      let tryOrder = 'try = [';
      const allServers = loadServersList();

      for (const serverId of backendServerIds) {
        const targetServer = allServers.find((s: any) => s.id === serverId);
        if (targetServer && fs.existsSync(targetServer.path)) {
            const propFile = path.join(targetServer.path, 'server.properties');
            if (fs.existsSync(propFile)) {
                const props = readServerProperties(propFile);
                props.set('online-mode', 'false');
                writeServerProperties(propFile, props);
            }
            const cleanName = targetServer.name.replace(/[^a-zA-Z0-9]/g, '');
            velocityServersConfig += `${cleanName} = "127.0.0.1:${targetServer.port}"\n`;
            tryOrder += `"${cleanName}", `;
        }
      }
      tryOrder = tryOrder.replace(/, $/, '') + ']';

      if (proxySoftware === 'Velocity') {
        const velocityToml = `bind = "0.0.0.0:${proxyPort}"\nshow-max-players = 500\nonline-mode = true\nforce-key-authentication = true\nplayer-info-forwarding-mode = "modern"\nforwarding-secret-file = "forwarding.secret"\nannoun-forwarding-secret = true\n\n${velocityServersConfig}\n\n${tryOrder}`;
        fs.writeFileSync(path.join(proxyPath, 'velocity.toml'), velocityToml);
      } else {
        const configYml = `listeners:\n- query_port: ${proxyPort}\n  host: 0.0.0.0:${proxyPort}\n  max_players: 1\nonline_mode: true\nip_forward: true\nservers:\n  # Auto-generated`;
        fs.writeFileSync(path.join(proxyPath, 'config.yml'), configYml);
      }
      return { success: true, message: `プロキシ設定を作成しました。\n場所: ${proxyPath}` };
    } catch (err: any) {
      return { success: false, message: `エラー: ${err.message}` };
    }
  });

  ipcMain.on('start-server', (event, serverId) => {
    if (activeServers.has(serverId)) return;
    const servers = loadServersList();
    const server = servers.find((s: any) => s.id === serverId);
    if (!server || !server.path) return;

    const sender = event.sender;
    const jarPath = path.join(server.path, 'server.jar');

    if (!fs.existsSync(jarPath)) {
      sendLog(sender, serverId, `[ERROR] server.jarが見つかりません。ダウンロードしてください。`);
      return;
    }

    sendLog(sender, serverId, `[INFO] Starting Server: ${server.name} (${server.version})...`);
    sendStatus(serverId, 'online');

    const minMem = '1G';
    const maxMem = `${server.memory || 4}G`;

    // Javaパスの決定 (Mac対応も考慮)
    let javaCommand = server.javaPath ? server.javaPath : 'java';

    if (server.javaPath && !fs.existsSync(server.javaPath) && server.javaPath !== 'java') {
        sendLog(sender, serverId, `[WARNING] Custom Java path not found: ${server.javaPath}. Falling back to system 'java'.`);
        javaCommand = 'java';
    }

    const javaProcess = spawn(javaCommand, [`-Xms${minMem}`, `-Xmx${maxMem}`, '-jar', 'server.jar', 'nogui'], {
      cwd: server.path
    });

    activeServers.set(serverId, javaProcess);

    javaProcess.stdout.on('data', (data) => sendLog(sender, serverId, data.toString()));
    javaProcess.stderr.on('data', (data) => sendLog(sender, serverId, data.toString()));

    javaProcess.on('close', (code) => {
      sendLog(sender, serverId, `[INFO] Server stopped with exit code ${code}`);
      activeServers.delete(serverId);
      sendStatus(serverId, 'offline');
    });

    javaProcess.on('error', (err) => {
      sendLog(sender, serverId, `[ERROR] Failed to start process: ${err.message}`);
      activeServers.delete(serverId);
      sendStatus(serverId, 'offline');
    });
  });

  ipcMain.on('stop-server', (event, serverId) => {
    const process = activeServers.get(serverId);
    if (process) {
      sendLog(event.sender, serverId, '[INFO] Sending stop command...');
      process.stdin?.write('stop\n');
      sendStatus(serverId, 'stopping');
    } else {
      sendLog(event.sender, serverId, '[INFO] Server is not running.');
    }
  });

  ipcMain.on('send-command', (event, { serverId, command }) => {
    const process = activeServers.get(serverId);
    if (process) {
      sendLog(event.sender, serverId, `> ${command}`);
      process.stdin?.write(`${command}\n`);
    } else {
      sendLog(event.sender, serverId, '[ERROR] Server is not running.');
    }
  });

  ipcMain.on('open-settings-window', (_event, currentSettings) => {
    if (settingsWindow) {
      settingsWindow.focus();
      return;
    }
    tempSettingsData = currentSettings;
    settingsWindow = new BrowserWindow({
      width: 900,
      height: 700,
      parent: mainWindow || undefined,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.mjs'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    if (process.env.VITE_DEV_SERVER_URL) {
      settingsWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#settings`);
    } else {
      settingsWindow.loadURL(`file://${path.join(__dirname, '../dist/index.html')}#settings`);
    }
    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });
  });

  ipcMain.on('settings-window-ready', (event) => {
    if (tempSettingsData) {
      event.sender.send('init-settings-data', tempSettingsData);
    }
  });

  ipcMain.on('save-settings-from-window', (_event, newSettings) => {
    if (mainWindow) {
      mainWindow.webContents.send('settings-updated', newSettings);
    }
  });

  ipcMain.handle('list-files', async (_event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) return [];
      const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return dirents.map(d => ({
        name: d.name,
        isDirectory: d.isDirectory()
      })).sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
      });
    } catch {
      return [];
    }
  });

  ipcMain.handle('read-file', async (_event, filePath) => {
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  });

  ipcMain.handle('save-file', async (_event, filePath, content) => {
    try {
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('create-directory', async (_event, dirPath) => {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('delete-path', async (_event, targetPath) => {
    try {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('move-path', async (_event, srcPath, destPath) => {
    try {
      await fs.promises.rename(srcPath, destPath);
      return true;
    } catch {
      try {
        await fs.promises.cp(srcPath, destPath, { recursive: true });
        await fs.promises.rm(srcPath, { recursive: true, force: true });
        return true;
      } catch {
        return false;
      }
    }
  });

  ipcMain.handle('upload-files', async (_event, filePaths, destDir) => {
    try {
      for (const src of filePaths) {
        const fileName = path.basename(src);
        const dest = path.join(destDir, fileName);
        await fs.promises.cp(src, dest, { recursive: true });
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('compress-files', async (_event, filePaths, destPath) => {
    try {
      const zip = new AdmZip();
      for (const filePath of filePaths) {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          zip.addLocalFolder(filePath, path.basename(filePath));
        } else {
          zip.addLocalFile(filePath);
        }
      }
      zip.writeZip(destPath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('extract-archive', async (_event, archivePath, destPath) => {
    try {
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(destPath, true);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('create-backup', async (_event, _id, serverPath) => {
    try {
      if (!fs.existsSync(serverPath)) return false;
      const backupsDir = path.join(serverPath, 'backups');
      if (!fs.existsSync(backupsDir)) {
        await fs.promises.mkdir(backupsDir);
      }
      const zip = new AdmZip();
      const files = await fs.promises.readdir(serverPath);
      files.forEach(f => {
        if (f === 'backups') return;
        const p = path.join(serverPath, f);
        if (fs.statSync(p).isDirectory()) {
          zip.addLocalFolder(p, f);
        } else {
          zip.addLocalFile(p);
        }
      });
      zip.writeZip(path.join(backupsDir, `backup-${Date.now()}.zip`));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('list-backups', async (_event, serverPath) => {
    try {
      const dir = path.join(serverPath, 'backups');
      if (!fs.existsSync(dir)) return [];
      const files = await fs.promises.readdir(dir);
      const res = [];
      for (const f of files) {
        if (f.endsWith('.zip')) {
          const s = await fs.promises.stat(path.join(dir, f));
          res.push({ name: f, date: s.mtime, size: s.size });
        }
      }
      return res.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch {
      return [];
    }
  });

  ipcMain.handle('restore-backup', async (_event, serverPath, backupName) => {
    try {
      const p = path.join(serverPath, 'backups', backupName);
      if (!fs.existsSync(p)) return false;
      const zip = new AdmZip(p);
      zip.extractAllTo(serverPath, true);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('delete-backup', async (_event, serverPath, backupName) => {
    try {
      const p = path.join(serverPath, 'backups', backupName);
      if (fs.existsSync(p)) {
        await fs.promises.unlink(p);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  });

  ipcMain.handle('search-modrinth', async (_event, query, type, version, offset = 0) => {
    try {
      const projectType = type === 'plugin' ? 'plugin' : 'mod';
      const facets = JSON.stringify([
        [`project_type:${projectType}`],
        [`versions:${version}`]
      ]);
      const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}&limit=30&offset=${offset}&index=downloads`;

      const result = await fetchJson(url);
      return result.hits || [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });

  ipcMain.handle('install-modrinth-project', async (_event, _projectId, _versionId, fileName, downloadUrl, serverPath, type) => {
    try {
      const folderName = type === 'plugin' ? 'plugins' : 'mods';
      const targetDir = path.join(serverPath, folderName);

      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true });
      }

      const destPath = path.join(targetDir, fileName);

      await new Promise<void>((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(downloadUrl, { headers: { 'User-Agent': 'MC-Vector/1.0' } }, (res) => {
          if (res.statusCode !== 200 && res.statusCode !== 302) {
            return reject(new Error(`Status: ${res.statusCode}`));
          }
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });

      return true;
    } catch (e) {
      console.error('Install failed:', e);
      return false;
    }
  });

  ipcMain.handle('search-hangar', async (_event, query, _version, offset = 0) => {
    try {
      const url = `https://hangar.papermc.io/api/v1/projects?q=${encodeURIComponent(query)}&limit=30&offset=${offset}&sort=-stars`;
      const result = await fetchJson(url);
      return result.result || [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });

  ipcMain.handle('install-hangar-project', async (_event, downloadUrl, fileName, serverPath) => {
    try {
      const targetDir = path.join(serverPath, 'plugins');
      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true });
      }
      const destPath = path.join(targetDir, fileName);

      await new Promise<void>((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(downloadUrl, { headers: { 'User-Agent': 'MC-Vector/1.0' } }, (res) => {
          if (res.statusCode !== 200 && res.statusCode !== 302) {
            return reject(new Error(`Status: ${res.statusCode}`));
          }
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
      });
      return true;
    } catch (e) {
      return false;
    }
  });

  // ★追加: Javaバージョン取得
  ipcMain.handle('get-java-versions', async () => {
    if (!fs.existsSync(RUNTIMES_PATH)) return [];
    const dirs = await fs.promises.readdir(RUNTIMES_PATH, { withFileTypes: true });
    const javaList: { name: string, path: string, version: number }[] = [];

    const isWin = process.platform === 'win32';
    const binName = isWin ? 'java.exe' : 'java';

    for (const d of dirs) {
      if (d.isDirectory()) {
        const fullPath = path.join(RUNTIMES_PATH, d.name);

        // 1. 標準的な構造: jdk-17/bin/java
        let binPath = path.join(fullPath, 'bin', binName);

        // 2. Macの構造: jdk-17/Contents/Home/bin/java (tar解凍後)
        if (!fs.existsSync(binPath) && process.platform === 'darwin') {
           const macPath = path.join(fullPath, 'Contents', 'Home', 'bin', binName);
           if (fs.existsSync(macPath)) {
             binPath = macPath;
           }
        }

        if (fs.existsSync(binPath)) {
          const match = d.name.match(/jdk-?(\d+)/);
          const version = match ? parseInt(match[1]) : 0;
          javaList.push({
            name: d.name,
            path: binPath,
            version: version
          });
        }
      }
    }
    return javaList.sort((a, b) => b.version - a.version);
  });

  // ★追加: Javaダウンロード (Mac/Linux対応)
  ipcMain.handle('download-java', async (event, version: number) => {
    const sender = event.sender;
    const sendProgress = (percent: number) => {
      sender.send('download-progress', { serverId: 'java-install', progress: percent, status: `Downloading Java ${version}...` });
    };

    try {
      const isWin = process.platform === 'win32';
      const isMac = process.platform === 'darwin';

      // OSとアーキテクチャの検出
      let osStr = 'linux';
      if (isWin) osStr = 'windows';
      if (isMac) osStr = 'mac';

      let archStr = 'x64';
      if (process.arch === 'arm64') archStr = 'aarch64';

      const ext = isWin ? 'zip' : 'tar.gz';

      // Adoptium API URL
      const url = `https://api.adoptium.net/v3/binary/latest/${version}/ga/${osStr}/${archStr}/jdk/hotspot/normal/eclipse?project=jdk`;

      if (!fs.existsSync(RUNTIMES_PATH)) await fs.promises.mkdir(RUNTIMES_PATH, { recursive: true });

      const downloadPath = path.join(RUNTIMES_PATH, `java-${version}.${ext}`);

      // ダウンロード
      await downloadFile(url, downloadPath, sendProgress);

      sendProgress(100);
      sender.send('download-progress', { serverId: 'java-install', progress: 100, status: `Extracting Java ${version}...` });

      // 解凍処理
      if (isWin) {
        // Windows: ZIP解凍
        const zip = new AdmZip(downloadPath);
        zip.extractAllTo(RUNTIMES_PATH, true);
      } else {
        // Mac/Linux: tar.gz解凍
        await tar.x({
          file: downloadPath,
          cwd: RUNTIMES_PATH
        });
      }

      // 圧縮ファイルを削除
      await fs.promises.unlink(downloadPath);

      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  });

  ipcMain.handle('delete-java', async (_event, version: number) => {
    try {
      const dirs = await fs.promises.readdir(RUNTIMES_PATH);
      for (const d of dirs) {
        if (d.includes(`jdk-${version}`) || d.includes(`jdk${version}`)) {
          await fs.promises.rm(path.join(RUNTIMES_PATH, d), { recursive: true, force: true });
        }
      }
      return true;
    } catch {
      return false;
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});