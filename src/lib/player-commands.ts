import { tauriInvoke } from './tauri-api';

export type PlayerListType = 'whitelist' | 'ops' | 'banned-players' | 'banned-ips';
export type PlayerListAction = 'add' | 'remove';

export interface PlayerEntry {
  uuid?: string;
  name: string;
  level?: number;
  created?: string;
  source?: string;
  expires?: string;
  reason?: string;
  ip?: string;
  bypassesPlayerLimit?: boolean;
}

export interface PlayerListSnapshot {
  whitelist: PlayerEntry[];
  ops: PlayerEntry[];
  bannedPlayers: PlayerEntry[];
  bannedIps: PlayerEntry[];
}

export interface PlayerListMutationResult {
  lists: PlayerListSnapshot;
  changed: boolean;
  canonicalTarget: string;
}

export async function getPlayerLists(serverId: string): Promise<PlayerListSnapshot> {
  return tauriInvoke<PlayerListSnapshot>('get_player_lists', { serverId });
}

export async function mutatePlayerList(
  serverId: string,
  listType: PlayerListType,
  action: PlayerListAction,
  value: string,
): Promise<PlayerListMutationResult> {
  return tauriInvoke<PlayerListMutationResult>('mutate_player_list', {
    serverId,
    mutation: { listType, action, value },
  });
}
