import { getConfig, setConfig } from './config-commands';

const HISTORY_KEY_PREFIX = 'console-history:';
const MAX_HISTORY = 200;

export async function loadCommandHistory(serverId: string): Promise<string[]> {
  const history = await getConfig<string[]>(`${HISTORY_KEY_PREFIX}${serverId}`);
  return history ?? [];
}

export async function saveCommandHistory(serverId: string, history: string[]): Promise<void> {
  const trimmed = history.slice(-MAX_HISTORY);
  await setConfig(`${HISTORY_KEY_PREFIX}${serverId}`, trimmed);
}
