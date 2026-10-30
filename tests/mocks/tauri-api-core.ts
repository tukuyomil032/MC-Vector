import {
  ensureRuntimeDirectory,
  getE2eScenario,
  getE2eState,
  listRuntimeChildren,
  moveRuntimePath,
  readRuntimeFile,
  recordE2eCall,
  removeRuntimePath,
  resolveRuntimePath,
  setRuntimeFile,
} from '../e2e/support/e2e-runtime';
import { emit } from './tauri-api-event';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function requestPath(value: unknown): string {
  const request = asRecord(value);
  return resolveRuntimePath({
    root: String(request.root ?? ''),
    serverId: typeof request.serverId === 'string' ? request.serverId : undefined,
    relativePath: String(request.relativePath ?? ''),
  });
}

function errorWithCode(code: string): Error {
  return new Error(JSON.stringify({ code }));
}

function emitStatus(serverId: string, status: string): void {
  void emit('server-status-change', { serverId, status });
}

function emitProgress(serverId: string, status: string): void {
  void emit('download-progress', { serverId, progress: 100, status });
}

function serverEulaPath(serverId: string): string {
  return resolveRuntimePath({ root: 'servers', serverId, relativePath: 'eula.txt' });
}

function getServerEulaStatus(serverId: string): { accepted: boolean; fileExists: boolean } {
  const node = getE2eState().files[serverEulaPath(serverId)];
  if (!node || node.kind !== 'file') {
    return { accepted: false, fileExists: false };
  }

  const activeAssignments = (node.content ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith(';'))
    .filter((line) => line.startsWith('eula=') || line.startsWith('eula ='));
  return {
    accepted:
      activeAssignments.length > 0 &&
      activeAssignments.every(
        (line) =>
          line
            .slice(line.indexOf('=') + 1)
            .trim()
            .toLowerCase() === 'true',
      ),
    fileExists: true,
  };
}

function acceptServerEula(serverId: string): void {
  const path = serverEulaPath(serverId);
  const node = getE2eState().files[path];
  const content = node?.kind === 'file' ? (node.content ?? '') : '';
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/(?<=\n)/);
  let hasActiveAssignment = false;
  const updated = lines.map((line) => {
    const body = line.replace(/\r?\n$/, '');
    const trimmed = body.trimStart();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return line;
    const equalsIndex = body.indexOf('=');
    if (equalsIndex < 0 || body.slice(0, equalsIndex).trim() !== 'eula') return line;
    hasActiveAssignment = true;
    return `${body.slice(0, equalsIndex + 1)}true${line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : ''}`;
  });
  let accepted = updated.join('');
  if (!hasActiveAssignment) {
    if (accepted && !accepted.endsWith('\n')) accepted += newline;
    accepted += `eula=true${newline}`;
  }
  setRuntimeFile(path, accepted);
}

async function invokeCommand(cmd: string, args: unknown): Promise<unknown> {
  const state = getE2eState();
  const payload = asRecord(args);

  switch (cmd) {
    case 'get_servers':
      return structuredClone(
        state.servers.map((server) => ({
          ...server,
          status: state.runningServerIds.includes(server.id) ? 'online' : 'offline',
        })),
      );

    case 'create_server_profile': {
      const request = asRecord(payload.request);
      const serverId = crypto.randomUUID();
      const serverPath = resolveRuntimePath({
        root: 'servers',
        serverId,
        relativePath: '',
      });
      ensureRuntimeDirectory(serverPath);
      const server = {
        id: serverId,
        name: String(request.name ?? 'New Server'),
        profileName: request.profileName,
        groupName: request.groupName,
        version: String(request.version ?? ''),
        software: String(request.software ?? 'Vanilla'),
        port: Number(request.port ?? 25565),
        memory: Number(request.memoryGb ?? 4) * 1024,
        path: serverPath,
        status: 'offline',
        javaPath: request.javaPath,
        autoRestartOnCrash: request.autoRestartOnCrash ?? false,
        maxAutoRestarts: request.maxAutoRestarts ?? 3,
        autoRestartDelaySec: request.autoRestartDelaySec ?? 5,
        autoBackupEnabled: request.autoBackupEnabled ?? false,
        autoBackupIntervalMin: request.autoBackupIntervalMin ?? 60,
        autoBackupScheduleType: request.autoBackupScheduleType ?? 'interval',
        autoBackupTime: request.autoBackupTime ?? '03:00',
        autoBackupWeekday: request.autoBackupWeekday ?? 0,
        autoBackupRetainCount: request.autoBackupRetainCount,
        autoBackupRetainDays: request.autoBackupRetainDays,
        backupRestartAfterSafeBackup: request.backupRestartAfterSafeBackup,
        jvmArgs: request.jvmArgs,
        notifyOnCrash: request.notifyOnCrash,
        notifyOnStart: request.notifyOnStart,
        notifyOnHighCpu: request.notifyOnHighCpu,
        notifyHighCpuThreshold: request.notifyHighCpuThreshold,
        createdDate: new Date().toISOString(),
      } as (typeof state.servers)[number];
      state.servers = [...state.servers, structuredClone(server)];
      const jarInstalled =
        Boolean(request.importToken) ||
        ['Paper', 'LeafMC', 'Vanilla', 'Fabric'].includes(server.software);
      return { server, jarInstalled };
    }

    case 'update_server': {
      const server = payload.server as (typeof state.servers)[number];
      const index = state.servers.findIndex((entry) => entry.id === server.id);
      if (index < 0) return false;
      state.servers = state.servers.map((entry, entryIndex) =>
        entryIndex === index ? structuredClone(server) : entry,
      );
      return true;
    }

    case 'clone_server_profile': {
      const sourceServerId = String(payload.sourceServerId ?? '');
      if (state.runningServerIds.includes(sourceServerId)) {
        throw new Error('Cannot clone a running server');
      }
      const source = state.servers.find((server) => server.id === sourceServerId);
      if (!source) throw new Error('Server is not registered');
      const destinationServerId = crypto.randomUUID();
      const sourceRoot = resolveRuntimePath({
        root: 'servers',
        serverId: sourceServerId,
        relativePath: '',
      });
      const destinationRoot = resolveRuntimePath({
        root: 'servers',
        serverId: destinationServerId,
        relativePath: '',
      });
      const sourceEntries = Object.entries(state.files).filter(
        ([path]) => path === sourceRoot || path.startsWith(`${sourceRoot}/`),
      );
      if (state.files[destinationRoot])
        throw new Error('Destination server directory already exists');
      for (const [path, node] of sourceEntries) {
        const destinationPath = `${destinationRoot}${path.slice(sourceRoot.length)}`;
        if (node.kind === 'directory') ensureRuntimeDirectory(destinationPath);
        else setRuntimeFile(destinationPath, node.content ?? '');
      }
      const cloned = {
        ...structuredClone(source),
        id: destinationServerId,
        name: String(payload.name ?? ''),
        path: destinationRoot,
        status: 'offline' as const,
        createdDate: new Date().toISOString(),
        unavailableReason: undefined,
      };
      state.servers = [...state.servers, cloned];
      return cloned;
    }

    case 'delete_managed_server': {
      const serverId = String(payload.serverId ?? '');
      if (state.runningServerIds.includes(serverId)) {
        throw new Error('Cannot delete a running server');
      }
      const existingCount = state.servers.length;
      state.servers = state.servers.filter((server) => server.id !== serverId);
      if (state.servers.length === existingCount) return false;
      removeRuntimePath(resolveRuntimePath({ root: 'servers', serverId, relativePath: '' }));
      return true;
    }

    case 'get_server_templates':
      return structuredClone(state.serverTemplates);

    case 'save_server_template': {
      const template = payload.template as Record<string, unknown>;
      const index = state.serverTemplates.findIndex((entry) => entry.id === template.id);
      if (index < 0) state.serverTemplates.push(structuredClone(template));
      else state.serverTemplates[index] = structuredClone(template);
      return template;
    }

    case 'delete_server_template':
      state.serverTemplates = state.serverTemplates.filter(
        (template) => template.id !== payload.templateId,
      );
      return null;

    case 'resolve_managed_path':
      return requestPath(payload.request);

    case 'create_managed_directory':
      ensureRuntimeDirectory(requestPath(payload.request));
      return null;

    case 'list_dir_with_metadata':
      return listRuntimeChildren(requestPath(payload.request));

    case 'read_managed_text_file':
      return readRuntimeFile(requestPath(payload.request));

    case 'write_managed_text_file':
      setRuntimeFile(requestPath(payload.request), String(payload.content ?? ''));
      return null;

    case 'get_server_eula_status':
      return getServerEulaStatus(String(payload.serverId ?? ''));

    case 'accept_server_eula':
      acceptServerEula(String(payload.serverId ?? ''));
      return null;

    case 'delete_managed_path':
      removeRuntimePath(requestPath(payload.request));
      return null;

    case 'move_managed_path':
      moveRuntimePath(requestPath(payload.from), requestPath(payload.to));
      return null;

    case 'import_managed_files': {
      const serverId = String(payload.serverId ?? 'server-1');
      const relativePath = 'imported.jar';
      setRuntimeFile(
        resolveRuntimePath({ root: 'servers', serverId, relativePath }),
        'imported-e2e-file',
      );
      return [{ serverId, relativePath, isDirectory: false, size: 17 }];
    }

    case 'compress_managed_items':
      setRuntimeFile(requestPath(payload.destination), 'e2e-archive');
      return requestPath(payload.destination);

    case 'extract_managed_item':
      ensureRuntimeDirectory(requestPath(payload.destination));
      return null;

    case 'prepare_server_jar_install': {
      const request = asRecord(payload.request);
      const serverId = String(request.serverId ?? '');
      const version = String(request.version ?? '');
      const mode = String(request.mode ?? 'create');
      const server = state.servers.find((entry) => entry.id === serverId);
      if (mode === 'upgrade' && !server) throw new Error('Server profile no longer exists');
      return {
        planId: `${serverId}:${mode}:${version}`,
        latestVersion: version,
        verified: true,
      };
    }

    case 'execute_server_jar_install': {
      const [serverId, _mode, version] = String(payload.planId ?? '').split(':');
      if (!serverId || !version) throw new Error('Invalid server jar plan');
      setRuntimeFile(
        resolveRuntimePath({ root: 'servers', serverId, relativePath: 'server.jar' }),
        'e2e-server-jar',
      );
      emitProgress(serverId, 'server.jar');
      return { serverId, version };
    }

    case 'prepare_plugin_install': {
      const request = asRecord(payload.request);
      const project = asRecord(request.project);
      const serverId = String(request.serverId ?? '');
      const server = state.servers.find((entry) => entry.id === serverId);
      if (!server) throw new Error('Server profile no longer exists');
      const provider = String(project.provider ?? '');
      const projectId = String(project.projectId ?? '');
      const resourceId = Number(project.resourceId);
      const directory = ['Fabric', 'Forge', 'NeoForge'].includes(server.software ?? '')
        ? 'mods'
        : 'plugins';
      const fileName =
        provider === 'spiget'
          ? 'veinminer-1.jar'
          : provider === 'hangar'
            ? 'WirelessRedstone-2.0.jar'
            : 'VeinMiner-1.21.4.jar';
      const directoryPath = resolveRuntimePath({
        root: 'servers',
        serverId,
        relativePath: directory,
      });
      const artifactPath = `${directoryPath}/${fileName}`;
      const installedFileName = state.files[artifactPath] ? fileName : null;
      const replaceFileName =
        typeof request.replaceFileName === 'string' ? request.replaceFileName : null;
      if (replaceFileName && !state.files[`${directoryPath}/${replaceFileName}`]) {
        throw new Error('Replacement plugin no longer exists');
      }
      const token = `mock-plugin-plan-${state.pluginDownloadAttempts + 1}-${Date.now()}`;
      const artifactId = `${provider}:${projectId || resourceId}:version-1`;
      const requiresUnverifiedDownloads = getE2eScenario() === 'hashless-plugin';
      state.pluginInstallPlans[token] = {
        serverId,
        fileName: replaceFileName?.endsWith('.disabled') ? `${fileName}.disabled` : fileName,
        artifactId,
        dependencyIds: [],
      };
      return {
        token,
        expiresInSeconds: 300,
        serverId,
        serverVersion: server.version,
        serverSoftware: server.software,
        targetDirectory: directory,
        artifacts: [
          {
            id: artifactId,
            project: project,
            title: provider === 'hangar' ? 'WirelessRedstone' : 'VeinMiner',
            version: provider === 'hangar' ? '2.0' : '1.21.4',
            fileName,
            installedFileName,
            dependency: false,
            verified: !requiresUnverifiedDownloads,
            compatibility: 'compatible',
            supportedVersions: [server.version],
          },
        ],
        missingDependencyIds: [],
        externalUrl: null,
        requiresUnverifiedDownloads,
      };
    }

    case 'execute_plugin_install': {
      const request = asRecord(payload.request);
      const token = String(request.token ?? '');
      const plan = state.pluginInstallPlans[token];
      if (!plan) throw new Error('Install plan is unknown or already used');
      delete state.pluginInstallPlans[token];
      const confirmed = Array.isArray(request.confirmedDependencyIds)
        ? request.confirmedDependencyIds.map(String).sort()
        : [];
      if (JSON.stringify(confirmed) !== JSON.stringify([...plan.dependencyIds].sort())) {
        throw new Error('Confirmation must match the exact planned missing dependency set');
      }
      state.pluginDownloadAttempts += 1;
      const scenario = getE2eScenario();
      if (scenario === 'hashless-plugin' && state.config.allowUnverifiedPluginDownloads !== true) {
        throw errorWithCode('unverified-artifact-blocked');
      }
      if (scenario === 'checksum-mismatch') throw errorWithCode('checksum-mismatch');
      if (scenario === 'network-retry' && state.pluginDownloadAttempts === 1) {
        throw errorWithCode('network');
      }
      const relativePath = `${
        ['Fabric', 'Forge', 'NeoForge'].includes(
          state.servers.find((entry) => entry.id === plan.serverId)?.software ?? '',
        )
          ? 'mods'
          : 'plugins'
      }/${plan.fileName}`;
      const destination = resolveRuntimePath({
        root: 'servers',
        serverId: plan.serverId,
        relativePath,
      });
      setRuntimeFile(destination, 'e2e-plugin-jar');
      void emit(`download-progress-${token}`, {
        downloaded: 100,
        total: 100,
        artifactId: plan.artifactId,
      });
      return { serverId: plan.serverId, installedFileNames: [plan.fileName] };
    }

    case 'toggle_installed_plugin': {
      const request = asRecord(payload.request);
      const serverId = String(request.serverId ?? '');
      const fileName = String(request.fileName ?? '');
      const server = state.servers.find((entry) => entry.id === serverId);
      if (!server) throw new Error('Server profile no longer exists');
      const directory = ['Fabric', 'Forge', 'NeoForge'].includes(server.software ?? '')
        ? 'mods'
        : 'plugins';
      const current = resolveRuntimePath({
        root: 'servers',
        serverId,
        relativePath: `${directory}/${fileName}`,
      });
      const nextFile = fileName.toLowerCase().endsWith('.disabled')
        ? fileName.slice(0, -9)
        : `${fileName}.disabled`;
      const next = resolveRuntimePath({
        root: 'servers',
        serverId,
        relativePath: `${directory}/${nextFile}`,
      });
      moveRuntimePath(current, next);
      return nextFile;
    }

    case 'uninstall_installed_plugin': {
      const request = asRecord(payload.request);
      const serverId = String(request.serverId ?? '');
      const fileName = String(request.fileName ?? '');
      const server = state.servers.find((entry) => entry.id === serverId);
      if (!server) throw new Error('Server profile no longer exists');
      const directory = ['Fabric', 'Forge', 'NeoForge'].includes(server.software ?? '')
        ? 'mods'
        : 'plugins';
      const target = resolveRuntimePath({
        root: 'servers',
        serverId,
        relativePath: `${directory}/${fileName}`,
      });
      if (!state.files[target]) throw new Error('Installed plugin does not exist');
      removeRuntimePath(target);
      return null;
    }

    case 'start_server': {
      const serverId = String(payload.serverId ?? '');
      if (!state.servers.some((server) => server.id === serverId)) {
        throw new Error('Server is not registered');
      }
      if (!getServerEulaStatus(serverId).accepted) {
        throw errorWithCode('eula-required');
      }
      state.runningServerIds = [...new Set([...state.runningServerIds, serverId])];
      emitStatus(serverId, 'starting');
      emitStatus(serverId, 'online');
      return null;
    }

    case 'stop_server': {
      const serverId = String(payload.serverId ?? '');
      state.runningServerIds = state.runningServerIds.filter((id) => id !== serverId);
      emitStatus(serverId, 'stopping');
      emitStatus(serverId, 'offline');
      return null;
    }

    case 'restart_server': {
      const serverId = String(payload.serverId ?? '');
      if (!state.servers.some((server) => server.id === serverId)) {
        throw new Error('Server is not registered');
      }
      if (!getServerEulaStatus(serverId).accepted) {
        throw errorWithCode('eula-required');
      }
      if (!state.runningServerIds.includes(serverId)) {
        throw new Error('Server not found or not running');
      }
      emitStatus(serverId, 'offline');
      emitStatus(serverId, 'online');
      return null;
    }

    case 'send_command':
      void emit('server-log', {
        serverId: payload.serverId,
        line: `> ${payload.command}`,
        stream: 'stdout',
      });
      return null;

    case 'is_server_running':
      return state.runningServerIds.includes(String(payload.serverId ?? ''));

    case 'get_server_pid':
      return state.runningServerIds.includes(String(payload.serverId ?? '')) ? 4321 : null;

    case 'get_server_stats':
      return { cpu: 1, memory: 256 };

    case 'ping_server':
      return true;

    case 'parse_ansi_lines':
      return [];

    case 'create_managed_backup': {
      const serverId = String(payload.serverId ?? '');
      const backupName = String(payload.backupName ?? 'backup.zip');
      const wasRunning = state.runningServerIds.includes(serverId);
      if (wasRunning && payload.stopRunningServer !== true) {
        return { status: 'confirmation_required' };
      }
      if (wasRunning) {
        state.runningServerIds = state.runningServerIds.filter((id) => id !== serverId);
        emitStatus(serverId, 'stopping');
        emitStatus(serverId, 'offline');
      }
      const backupPath = resolveRuntimePath({
        root: 'backups',
        serverId,
        relativePath: backupName,
      });
      setRuntimeFile(backupPath, 'e2e-backup');
      state.backups[serverId] = [...(state.backups[serverId] ?? []), backupName];
      void emit('backup-progress', { serverId, progress: 100 });
      if (wasRunning) {
        state.runningServerIds = [...new Set([...state.runningServerIds, serverId])];
        emitStatus(serverId, 'starting');
        emitStatus(serverId, 'online');
      }
      return {
        status: 'created',
        backupName,
        catalogError: null,
        restart: wasRunning ? { status: 'restarted' } : { status: 'not_needed' },
      };
    }

    case 'list_managed_backups': {
      const serverId = String(payload.serverId ?? '');
      return (getE2eState().backups[serverId] ?? []).map((value, index) => {
        const archivePath = String(value);
        return {
          backupId: `e2e-backup-${index + 1}`,
          serverId,
          archivePath,
          kind: 'full',
          consistency: 'quiesced',
          origin: 'manual',
          createdAt: String(Date.now() + index),
          fileCount: 1,
          totalBytes: 1,
          archiveSha256: '0'.repeat(64),
          manifestVersion: 2,
          restoreEligible: true,
        };
      });
    }

    case 'delete_managed_backup': {
      const serverId = String(payload.serverId ?? '');
      const backupName = String(payload.backupName ?? '');
      const state = getE2eState();
      state.backups[serverId] = (state.backups[serverId] ?? []).filter(
        (name) => name !== backupName,
      );
      removeRuntimePath(
        resolveRuntimePath({ root: 'backups', serverId, relativePath: backupName }),
      );
      return [];
    }

    case 'apply_managed_backup_retention':
      return { deletedNames: [], failedDeleteCount: 0, records: [] };

    case 'restore_managed_backup':
      return null;

    case 'download_java': {
      const majorVersion = Number(payload.majorVersion ?? 17);
      ensureRuntimeDirectory(
        resolveRuntimePath({ root: 'java', relativePath: `jdk-${majorVersion}` }),
      );
      void emit('java-download-progress', { progress: 100 });
      return resolveRuntimePath({ root: 'java', relativePath: `jdk-${majorVersion}` });
    }

    case 'start_ngrok':
      state.ngrokStatus = 'online';
      void emit('ngrok-status-change', {
        status: 'connected',
        url: 'https://example.ngrok.test',
        serverId: payload.serverId,
      });
      return null;

    case 'get_ngrok_token_status':
      return { configured: state.config.ngrokTokenConfigured === true };

    case 'set_ngrok_token':
      state.config.ngrokTokenConfigured = true;
      return null;

    case 'clear_ngrok_token':
      state.config.ngrokTokenConfigured = false;
      return null;

    case 'stop_ngrok':
      state.ngrokStatus = 'offline';
      void emit('ngrok-status-change', { status: 'stopped', serverId: payload.serverId });
      return null;

    case 'download_ngrok':
      ensureRuntimeDirectory(resolveRuntimePath({ root: 'ngrok', relativePath: '' }));
      return resolveRuntimePath({ root: 'ngrok', relativePath: 'ngrok' });

    case 'is_ngrok_installed':
      return true;

    case 'can_update_app':
      return false;

    case 'get_app_location':
      return '/mock/app';

    case 'pick_server_import':
    case 'cancel_server_import':
      return null;

    default:
      throw new Error(`Unregistered E2E IPC command: ${cmd}`);
  }
}

export async function invoke<T>(cmd: string, args?: unknown): Promise<T> {
  recordE2eCall('ipc', cmd, args);
  return (await invokeCommand(cmd, args)) as T;
}

export function isTauri(): boolean {
  return false;
}

export function convertFileSrc(filePath: string): string {
  return filePath;
}

export function transformCallback<T = unknown>(
  _callback?: (response: T) => void,
  _once?: boolean,
): number {
  return 0;
}
