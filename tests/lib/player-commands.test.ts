import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn();

vi.mock('@/lib/tauri-api', () => ({
  tauriInvoke: tauriInvokeMock,
  tauriListen: vi.fn(),
}));

describe('player-commands', () => {
  beforeEach(() => {
    vi.resetModules();
    tauriInvokeMock.mockReset();
  });

  it('loads the four player lists through Rust using the server ID', async () => {
    const lists = { whitelist: [], ops: [], bannedPlayers: [], bannedIps: [] };
    tauriInvokeMock.mockResolvedValueOnce(lists);
    const { getPlayerLists } = await import('@/lib/player-commands');

    await expect(getPlayerLists('server-1')).resolves.toEqual(lists);
    expect(tauriInvokeMock).toHaveBeenCalledWith('get_player_lists', { serverId: 'server-1' });
  });

  it('sends the typed mutation request to Rust and returns its canonical result', async () => {
    const result = {
      lists: { whitelist: [], ops: [], bannedPlayers: [], bannedIps: [] },
      changed: true,
      canonicalTarget: 'Alex',
    };
    tauriInvokeMock.mockResolvedValueOnce(result);
    const { mutatePlayerList } = await import('@/lib/player-commands');

    await expect(mutatePlayerList('server-1', 'whitelist', 'add', 'alex')).resolves.toEqual(result);
    expect(tauriInvokeMock).toHaveBeenCalledWith('mutate_player_list', {
      serverId: 'server-1',
      mutation: { listType: 'whitelist', action: 'add', value: 'alex' },
    });
  });
});
