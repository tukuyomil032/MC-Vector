import type {
  MinecraftServer,
  ServerStatus,
} from '../../../src/renderer/shared/server declaration';

export type E2eScenario =
  | 'default'
  | 'paper-plugin-success'
  | 'fabric-mod-success'
  | 'incompatible-plugin'
  | 'hashless-plugin'
  | 'checksum-mismatch'
  | 'checksum-invalid'
  | 'network-retry'
  | 'search-failure'
  | 'overwrite-existing-plugin'
  | 'disabled-plugin'
  | 'backup-flow'
  | 'file-flow'
  | 'proxy-flow';

export type E2eCallKind = 'ipc' | 'http' | 'store' | 'fs' | 'dialog' | 'opener';

export type E2eCall = {
  kind: E2eCallKind;
  name: string;
  args?: unknown;
};

export type E2eFileNode = {
  kind: 'file' | 'directory';
  content?: string;
  modified?: number;
};

export type E2eState = {
  servers: MinecraftServer[];
  files: Record<string, E2eFileNode>;
  config: Record<string, unknown>;
  javaVersions: unknown[];
  backups: Record<string, unknown[]>;
  runningServerIds: string[];
  pluginDownloadAttempts: number;
  searchAttempts: number;
  ngrokStatus: 'offline' | 'online';
};

export type E2eRuntime = {
  version: 1;
  scenario: E2eScenario;
  calls: E2eCall[];
  state: E2eState;
};

export const E2E_RUNTIME_KEY = '__MC_VECTOR_E2E__';

type E2eWindow = Window & {
  [E2E_RUNTIME_KEY]?: E2eRuntime;
};

const DEFAULT_APP_DATA_DIR = '/mock/app-data';

export function serverPath(serverId: string): string {
  return `${DEFAULT_APP_DATA_DIR}/servers/${serverId}`;
}

export function createServerFixture(
  serverId: string,
  software = 'Paper',
  version = '1.21.10',
): MinecraftServer {
  return {
    id: serverId,
    name: serverId === 'server-1' ? 'E2E Server' : serverId,
    version,
    software,
    port: 25565,
    memory: 2048,
    path: serverPath(serverId),
    status: 'offline',
    createdDate: '2026-01-01T00:00:00.000Z',
  };
}

function baseFiles(serverId: string, software: string): Record<string, E2eFileNode> {
  const root = serverPath(serverId);
  const pluginDir = software === 'Fabric' || software === 'Forge' ? 'mods' : 'plugins';
  const files: Record<string, E2eFileNode> = {
    [root]: { kind: 'directory' },
    [`${root}/server.properties`]: {
      kind: 'file',
      content: 'motd=E2E Server\ngamemode=survival\nserver-port=25565\n',
    },
    [`${root}/whitelist.json`]: { kind: 'file', content: '[]' },
    [`${root}/ops.json`]: { kind: 'file', content: '[]' },
    [`${root}/banned-players.json`]: { kind: 'file', content: '[]' },
    [`${root}/banned-ips.json`]: { kind: 'file', content: '[]' },
    [`${root}/${pluginDir}`]: { kind: 'directory' },
    [`${root}/world`]: { kind: 'directory' },
    [`${root}/backups`]: { kind: 'directory' },
    [`${root}/server.jar`]: { kind: 'file', content: 'e2e-server-jar' },
  };

  return files;
}

export function createE2eState(scenario: E2eScenario): E2eState {
  const seededServerScenario = new Set<E2eScenario>([
    'paper-plugin-success',
    'fabric-mod-success',
    'incompatible-plugin',
    'hashless-plugin',
    'checksum-mismatch',
    'checksum-invalid',
    'network-retry',
    'search-failure',
    'overwrite-existing-plugin',
    'disabled-plugin',
    'backup-flow',
    'file-flow',
    'proxy-flow',
  ]).has(scenario);
  const software = scenario === 'fabric-mod-success' ? 'Fabric' : 'Paper';
  const server = createServerFixture('server-1', software);
  const files = seededServerScenario ? baseFiles(server.id, software) : {};
  const pluginDir = software === 'Fabric' ? 'mods' : 'plugins';

  if (scenario === 'overwrite-existing-plugin' || scenario === 'disabled-plugin') {
    files[`${server.path}/${pluginDir}/VeinMiner-1.21.4.jar`] = {
      kind: 'file',
      content: 'old-plugin-jar',
    };
  }
  if (scenario === 'disabled-plugin') {
    delete files[`${server.path}/${pluginDir}/VeinMiner-1.21.4.jar`];
    files[`${server.path}/${pluginDir}/VeinMiner-1.21.4.jar.disabled`] = {
      kind: 'file',
      content: 'disabled-plugin-jar',
    };
  }

  return {
    servers: seededServerScenario ? [server] : [],
    files,
    config: {},
    javaVersions: [],
    backups: {},
    runningServerIds: [],
    pluginDownloadAttempts: 0,
    searchAttempts: 0,
    ngrokStatus: 'offline',
  };
}

export function getE2eRuntime(): E2eRuntime | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as E2eWindow)[E2E_RUNTIME_KEY] ?? null;
}

export function requireE2eRuntime(): E2eRuntime {
  const runtime = getE2eRuntime();
  if (!runtime || runtime.version !== 1) {
    throw new Error('E2E runtime was not initialized before the app loaded');
  }
  return runtime;
}

export function recordE2eCall(kind: E2eCallKind, name: string, args?: unknown): void {
  requireE2eRuntime().calls.push({ kind, name, args });
}

export function getE2eScenario(): E2eScenario {
  return requireE2eRuntime().scenario;
}

export function getE2eState(): E2eState {
  return requireE2eRuntime().state;
}

export function setServerStatus(serverId: string, status: ServerStatus): void {
  const state = getE2eState();
  state.servers = state.servers.map((server) =>
    server.id === serverId ? { ...server, status } : server,
  );
  if (status === 'online' || status === 'starting' || status === 'restarting') {
    if (!state.runningServerIds.includes(serverId)) state.runningServerIds.push(serverId);
  } else {
    state.runningServerIds = state.runningServerIds.filter((id) => id !== serverId);
  }
}

export function resolveRuntimePath(request: {
  root: string;
  serverId?: string;
  relativePath: string;
}): string {
  const serverSegment = request.serverId ? `/${request.serverId}` : '';
  const relativePath = request.relativePath ? `/${request.relativePath}` : '';
  return `${DEFAULT_APP_DATA_DIR}/${request.root}${serverSegment}${relativePath}`;
}

export function ensureRuntimeDirectory(path: string): void {
  const state = getE2eState();
  if (!state.files[path]) {
    state.files[path] = { kind: 'directory' };
  }
}

export function setRuntimeFile(path: string, content: string): void {
  const state = getE2eState();
  const parent = path.slice(0, path.lastIndexOf('/'));
  if (parent) ensureRuntimeDirectory(parent);
  state.files[path] = { kind: 'file', content, modified: Date.now() };
}

export function removeRuntimePath(path: string): void {
  const state = getE2eState();
  for (const key of Object.keys(state.files)) {
    if (key === path || key.startsWith(`${path}/`)) {
      delete state.files[key];
    }
  }
}

export function moveRuntimePath(from: string, to: string): void {
  const state = getE2eState();
  const entries = Object.entries(state.files).filter(
    ([key]) => key === from || key.startsWith(`${from}/`),
  );
  if (entries.length === 0) {
    throw new Error(`Path not found: ${from}`);
  }
  if (state.files[to]) {
    throw new Error(`Destination already exists: ${to}`);
  }
  removeRuntimePath(from);
  const parent = to.slice(0, to.lastIndexOf('/'));
  if (parent) ensureRuntimeDirectory(parent);
  for (const [key, node] of entries) {
    const suffix = key.slice(from.length);
    state.files[`${to}${suffix}`] = node;
  }
}

export function listRuntimeChildren(path: string): Array<{
  name: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}> {
  const state = getE2eState();
  const prefix = path.endsWith('/') ? path : `${path}/`;
  const children = new Map<string, { isDirectory: boolean; size: number; modified: number }>();
  for (const [key, node] of Object.entries(state.files)) {
    if (!key.startsWith(prefix) || key === path) continue;
    const remainder = key.slice(prefix.length);
    const name = remainder.split('/')[0];
    if (!name) continue;
    const isDirectFile = !remainder.includes('/');
    const previous = children.get(name);
    if (previous) {
      previous.isDirectory = true;
      continue;
    }
    children.set(name, {
      isDirectory: node.kind === 'directory' || !isDirectFile,
      size:
        node.kind === 'file' && isDirectFile
          ? new TextEncoder().encode(node.content ?? '').length
          : 0,
      modified: Math.floor((node.modified ?? Date.now()) / 1000),
    });
  }
  return [...children.entries()]
    .map(([name, metadata]) => ({ name, ...metadata }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function readRuntimeFile(path: string): string {
  const node = getE2eState().files[path];
  if (node?.kind === 'file') return node.content ?? '';
  if (
    path.endsWith('/whitelist.json') ||
    path.endsWith('/ops.json') ||
    path.endsWith('/banned-players.json') ||
    path.endsWith('/banned-ips.json')
  )
    return '[]';
  if (path.endsWith('/server.properties'))
    return 'motd=E2E Server\ngamemode=survival\nserver-port=25565\n';
  throw new Error(`Path not found: ${path}`);
}

export function seedRuntimeOnWindow(windowValue: Window, scenario: E2eScenario): void {
  (windowValue as E2eWindow)[E2E_RUNTIME_KEY] = {
    version: 1,
    scenario,
    calls: [],
    state: createE2eState(scenario),
  };
}
