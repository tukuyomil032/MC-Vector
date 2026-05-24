const mockData: Record<string, unknown> = {
  get_servers: [],
  is_server_running: false,
  get_server_pid: null,
  get_server_stats: null,
  ping_server: false,
  get_app_location: '/mock/app',
  can_update_app: false,
  parse_ansi_lines: [],
  security_gateway: null,
  get_server_templates: [],
};

export async function invoke<T>(cmd: string, _args?: unknown): Promise<T> {
  if (cmd in mockData) return mockData[cmd] as T;
  console.warn(`[tauri-mock] invoke: ${cmd}`);
  return null as T;
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
