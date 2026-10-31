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
import { pluginCatalogFixture } from './plugin-catalog';

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

function emitProgress(serverId: string): void {
  void emit('download-progress', { serverId, progress: 100 });
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

const playerListFiles = {
  whitelist: { key: 'whitelist', file: 'whitelist.json' },
  ops: { key: 'ops', file: 'ops.json' },
  'banned-players': { key: 'bannedPlayers', file: 'banned-players.json' },
  'banned-ips': { key: 'bannedIps', file: 'banned-ips.json' },
} as const;

type PlayerListType = keyof typeof playerListFiles;

function playerListPath(serverId: string, listType: PlayerListType): string {
  return resolveRuntimePath({
    root: 'servers',
    serverId,
    relativePath: playerListFiles[listType].file,
  });
}

function readPlayerList(serverId: string, listType: PlayerListType): Record<string, unknown>[] {
  const entries: unknown = JSON.parse(readRuntimeFile(playerListPath(serverId, listType)));
  if (!Array.isArray(entries)) throw new Error('Player list JSON must be an array');
  return entries.map((entry) => asRecord(entry));
}

function readPlayerLists(serverId: string): Record<string, Record<string, unknown>[]> {
  return Object.fromEntries(
    Object.keys(playerListFiles).map((listType) => {
      const type = listType as PlayerListType;
      return [playerListFiles[type].key, readPlayerList(serverId, type)];
    }),
  );
}

function parsePropertyValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) {
    const integer = Number(value);
    if (Number.isSafeInteger(integer)) return integer;
  }
  if (value.trim() !== '') {
    const decimal = Number(value);
    if (Number.isFinite(decimal)) return decimal;
  }
  return value;
}

function readServerProperties(serverId: string): Record<string, string | number | boolean> {
  const path = resolveRuntimePath({
    root: 'servers',
    serverId,
    relativePath: 'server.properties',
  });
  const properties: Record<string, string | number | boolean> = {};
  for (const [index, line] of readRuntimeFile(path).split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const delimiter = line.indexOf('=');
    if (delimiter < 0) throw new Error(`Malformed server.properties entry on line ${index + 1}`);
    const key = line.slice(0, delimiter).trim();
    if (!key) throw new Error(`Empty server.properties key on line ${index + 1}`);
    properties[key] = parsePropertyValue(line.slice(delimiter + 1).trim());
  }
  return properties;
}

function serializePropertyValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  throw new Error('Invalid server.properties value');
}

function patchServerProperties(serverId: string, updates: Record<string, unknown>): number | null {
  const path = resolveRuntimePath({
    root: 'servers',
    serverId,
    relativePath: 'server.properties',
  });
  const original = readRuntimeFile(path);
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const found = new Set<string>();
  let updated = original
    .split(/(?<=\n)/)
    .map((line) => {
      const body = line.replace(/\r?\n$/, '');
      const ending = line.slice(body.length);
      const trimmed = body.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return line;
      const delimiter = body.indexOf('=');
      if (delimiter < 0) {
        throw new Error(
          'Cannot update malformed server.properties entry without overwriting the file',
        );
      }
      const key = body.slice(0, delimiter).trim();
      if (!key) {
        throw new Error(
          'Cannot update server.properties with an empty key without overwriting the file',
        );
      }
      if (!Object.hasOwn(updates, key)) return line;
      found.add(key);
      const originalValue = body.slice(delimiter + 1);
      const leading = originalValue.length - originalValue.trimStart().length;
      const trailing = originalValue.length - originalValue.trimEnd().length;
      const trailingStart = originalValue.length - trailing;
      return `${body.slice(0, delimiter + 1)}${originalValue.slice(0, Math.min(leading, trailingStart))}${serializePropertyValue(updates[key])}${originalValue.slice(trailingStart)}${ending}`;
    })
    .join('');

  const missingKeys = Object.keys(updates)
    .filter((key) => !found.has(key))
    .sort();
  for (const key of missingKeys) {
    if (updated && !updated.endsWith('\n')) updated += newline;
    updated += `${key}=${serializePropertyValue(updates[key])}${newline}`;
  }
  setRuntimeFile(path, updated);
  const rawPort = updates['server-port'];
  if (rawPort === undefined) return null;
  const port = typeof rawPort === 'number' ? rawPort : Number(rawPort);
  const server = getE2eState().servers.find((entry) => entry.id === serverId);
  if (server) server.port = port;
  return port;
}

async function invokeCommand(cmd: string, args: unknown): Promise<unknown> {
  const state = getE2eState();
  const payload = asRecord(args);
  const metadata = pluginCatalogFixture(cmd);
  if (metadata !== undefined) return metadata;

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

    case 'get_player_lists':
      return readPlayerLists(String(payload.serverId ?? ''));

    case 'mutate_player_list': {
      const serverId = String(payload.serverId ?? '');
      const mutation = asRecord(payload.mutation);
      const listType = String(mutation.listType ?? '') as PlayerListType;
      const action = String(mutation.action ?? '');
      const value = String(mutation.value ?? '').trim();
      if (!Object.hasOwn(playerListFiles, listType)) throw new Error('Invalid player list type');
      if (action !== 'add' && action !== 'remove') throw new Error('Invalid player list action');
      if (!value) throw new Error('Player list value cannot be empty');

      const entries = readPlayerList(serverId, listType);
      const isIpList = listType === 'banned-ips';
      const field = isIpList ? 'ip' : 'name';
      const matches = (entry: Record<string, unknown>) =>
        String(entry[field] ?? '').toLocaleLowerCase() === value.toLocaleLowerCase();
      const changed = action === 'add' ? !entries.some(matches) : entries.some(matches);
      if (changed) {
        const nextEntries =
          action === 'add'
            ? [...entries, isIpList ? { ip: value } : { name: value }]
            : entries.filter((entry) => !matches(entry));
        setRuntimeFile(playerListPath(serverId, listType), JSON.stringify(nextEntries, null, 2));
      }
      return { lists: readPlayerLists(serverId), changed, canonicalTarget: value };
    }

    case 'get_server_properties':
      return readServerProperties(String(payload.serverId ?? ''));

    case 'save_server_properties': {
      const updates = asRecord(payload.updates);
      return patchServerProperties(String(payload.serverId ?? ''), updates);
    }

    case 'configure_proxy_network': {
      const request = asRecord(payload.request);
      const backendServerIds = Array.isArray(request.backendServerIds)
        ? request.backendServerIds.map(String)
        : [];
      return backendServerIds.map((serverId, index) => {
        const port = 25_566 + index;
        patchServerProperties(serverId, { 'online-mode': false, 'server-port': port });
        return { serverId, port };
      });
    }

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
      emitProgress(serverId);
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

    case 'get_allow_unverified_plugin_downloads':
      return state.config.allowUnverifiedPluginDownloads === true;

    case 'set_allow_unverified_plugin_downloads':
      state.config.allowUnverifiedPluginDownloads = payload.enabled === true;
      return null;

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

    case 'download_plugin_artifact': {
      const request = asRecord(payload.request);
      const serverId = String(request.serverId ?? '');
      const relativePath = String(request.relativePath ?? '');
      const eventId = String(request.eventId ?? '');
      const scenario = getE2eScenario();
      state.pluginDownloadAttempts += 1;

      if (
        scenario === 'hashless-plugin' &&
        request.checksum == null &&
        state.config.allowUnverifiedPluginDownloads !== true
      ) {
        throw errorWithCode('unverified-artifact-blocked');
      }
      if (scenario === 'checksum-mismatch') throw errorWithCode('checksum-mismatch');
      if (scenario === 'network-retry' && state.pluginDownloadAttempts === 1) {
        throw errorWithCode('network');
      }

      const path = resolveRuntimePath({ root: 'servers', serverId, relativePath });
      setRuntimeFile(path, 'e2e-plugin-jar');
      void emit(`download-progress-${eventId}`, { downloaded: 100, total: 100 });
      return null;
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
      // A test can seed config.serverImportAnalysis to exercise the analyzed import states.
      return getE2eState().config.serverImportAnalysis ?? null;
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
