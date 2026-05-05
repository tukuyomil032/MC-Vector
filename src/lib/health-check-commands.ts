import { tauriInvoke } from './tauri-api';

export interface PingResult {
  online: boolean;
  latency_ms: number;
  players_online: number | null;
  players_max: number | null;
  version: string | null;
  motd: string | null;
}

export async function pingServer(host: string, port: number): Promise<PingResult> {
  return tauriInvoke('ping_server', { host, port });
}
