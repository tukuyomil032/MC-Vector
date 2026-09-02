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

function pluginDestinationPath(request: Record<string, unknown>): string {
  const serverId = typeof request.serverId === 'string' ? request.serverId : '';
  const relativePath = typeof request.relativePath === 'string' ? request.relativePath : '';
  const isManagedPluginPath = /^(?:plugins|mods)\/[^/\\]+\.jar$/i.test(relativePath);
  if (!serverId || !isManagedPluginPath) {
    throw errorWithCode('destination-rejected');
  }
  return resolveRuntimePath({ root: 'servers', serverId, relativePath });
}

async function invokeCommand(cmd: string, args: unknown): Promise<unknown> {
  const state = getE2eState();
  const payload = asRecord(args);

  switch (cmd) {
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

    case 'delete_managed_path':
      removeRuntimePath(requestPath(payload.request));
      return null;

    case 'move_managed_path':
      moveRuntimePath(requestPath(payload.from), requestPath(payload.to));
      return null;

    case 'delete_managed_server_dir':
      removeRuntimePath(
        resolveRuntimePath({
          root: 'servers',
          serverId: String(payload.serverId),
          relativePath: '',
        }),
      );
      return null;

    case 'clone_managed_server': {
      const sourceId = String(payload.sourceServerId ?? '');
      const destinationId = String(payload.destinationServerId ?? '');
      const sourceRoot = resolveRuntimePath({
        root: 'servers',
        serverId: sourceId,
        relativePath: '',
      });
      const destinationRoot = resolveRuntimePath({
        root: 'servers',
        serverId: destinationId,
        relativePath: '',
      });
      const sourceEntries = Object.entries(state.files).filter(
        ([path]) => path === sourceRoot || path.startsWith(`${sourceRoot}/`),
      );
      ensureRuntimeDirectory(destinationRoot);
      for (const [path, node] of sourceEntries) {
        const destinationPath = `${destinationRoot}${path.slice(sourceRoot.length)}`;
        if (node.kind === 'directory') ensureRuntimeDirectory(destinationPath);
        else setRuntimeFile(destinationPath, node.content ?? '');
      }
      return null;
    }

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

    case 'migrate_managed_server_directory': {
      const serverId = String(payload.serverId ?? '');
      ensureRuntimeDirectory(resolveRuntimePath({ root: 'servers', serverId, relativePath: '' }));
      return resolveRuntimePath({ root: 'servers', serverId, relativePath: '' });
    }

    case 'download_server_jar': {
      const request = asRecord(payload.request);
      const serverId = String(request.serverId ?? '');
      const relativePath = String(request.relativePath ?? 'server.jar');
      setRuntimeFile(
        resolveRuntimePath({ root: 'servers', serverId, relativePath }),
        'e2e-server-jar',
      );
      emitProgress(serverId, 'server.jar');
      return null;
    }

    case 'download_plugin_artifact': {
      const request = asRecord(payload.request);
      const destination = pluginDestinationPath(request);
      state.pluginDownloadAttempts += 1;
      const checksum = request.checksum;
      const scenario = getE2eScenario();
      if (!checksum && state.config.allowUnverifiedPluginDownloads !== true) {
        throw errorWithCode('unverified-artifact-blocked');
      }
      if (scenario === 'checksum-mismatch') throw errorWithCode('checksum-mismatch');
      if (scenario === 'checksum-invalid') throw errorWithCode('checksum-invalid');
      if (scenario === 'network-retry' && state.pluginDownloadAttempts === 1) {
        throw errorWithCode('network');
      }
      setRuntimeFile(destination, 'e2e-plugin-jar');
      emitProgress(String(request.serverId), 'plugin');
      return null;
    }

    case 'start_server': {
      const serverId = String(payload.serverId ?? '');
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
      const backupPath = resolveRuntimePath({
        root: 'backups',
        serverId,
        relativePath: backupName,
      });
      setRuntimeFile(backupPath, 'e2e-backup');
      state.backups[serverId] = [...(state.backups[serverId] ?? []), backupName];
      void emit('backup-progress', { serverId, progress: 100 });
      return null;
    }

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
    case 'complete_server_import':
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
