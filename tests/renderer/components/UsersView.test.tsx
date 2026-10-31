import { useI18nStore } from '@/i18n';
import UsersView from '@/renderer/components/UsersView';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { playerCommands, sendCommand, toastMock, confirmMock } = vi.hoisted(() => ({
  playerCommands: {
    getPlayerLists: vi.fn(),
    mutatePlayerList: vi.fn(),
  },
  sendCommand: vi.fn(),
  toastMock: {
    error: vi.fn(),
    success: vi.fn(),
  },
  confirmMock: vi.fn(),
}));

vi.mock('@/lib/player-commands', () => playerCommands);
vi.mock('@/lib/server-commands', () => ({ sendCommand }));
vi.mock('@/renderer/shared/notify', () => ({
  notify: { error: toastMock.error, success: toastMock.success, info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/renderer/components/AppFeedbackProvider', () => ({
  useAppFeedback: () => ({ confirm: confirmMock }),
}));

const emptyLists = { whitelist: [], ops: [], bannedPlayers: [], bannedIps: [] };
const server = {
  id: 'server-1',
  name: 'Paper Server',
  path: '/managed/server-1',
  status: 'online',
} as never;

describe('UsersView', () => {
  beforeEach(() => {
    useI18nStore.setState({ currentLocale: 'en' });
    playerCommands.getPlayerLists.mockReset().mockResolvedValue(emptyLists);
    playerCommands.mutatePlayerList.mockReset();
    sendCommand.mockReset().mockResolvedValue(undefined);
    toastMock.error.mockReset();
    toastMock.success.mockReset();
    confirmMock.mockReset().mockResolvedValue(false);
  });

  it('asks before removing an entry and leaves the list alone when canceled', async () => {
    playerCommands.getPlayerLists.mockResolvedValue({
      ...emptyLists,
      whitelist: [{ name: 'Alex', uuid: '0123456789abcdef0123456789abcdef' }],
    });

    render(<UsersView server={server} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce());
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Remove "Alex" from this list?',
        tone: 'danger',
      }),
    );
    expect(playerCommands.mutatePlayerList).not.toHaveBeenCalled();
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('removes the entry through Rust once the confirm is accepted', async () => {
    playerCommands.getPlayerLists.mockResolvedValue({
      ...emptyLists,
      whitelist: [{ name: 'Alex', uuid: '0123456789abcdef0123456789abcdef' }],
    });
    confirmMock.mockResolvedValue(true);
    playerCommands.mutatePlayerList.mockResolvedValueOnce({
      lists: emptyLists,
      changed: true,
      canonicalTarget: 'Alex',
    });

    render(<UsersView server={server} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(playerCommands.mutatePlayerList).toHaveBeenCalledWith(
        'server-1',
        'whitelist',
        'remove',
        'Alex',
      ),
    );
  });

  it('loads lists by server ID and routes list updates through Rust', async () => {
    const updatedLists = {
      ...emptyLists,
      whitelist: [{ name: 'Alex', uuid: '0123456789abcdef0123456789abcdef' }],
    };
    playerCommands.mutatePlayerList.mockResolvedValueOnce({
      lists: updatedLists,
      changed: true,
      canonicalTarget: 'Alex',
    });

    render(<UsersView server={server} />);
    await screen.findByTestId('users-list-whitelist');
    expect(playerCommands.getPlayerLists).toHaveBeenCalledWith('server-1');

    fireEvent.change(screen.getByTestId('users-input-whitelist'), { target: { value: 'alex' } });
    fireEvent.click(screen.getByTestId('users-add-whitelist'));

    await waitFor(() =>
      expect(playerCommands.mutatePlayerList).toHaveBeenCalledWith(
        'server-1',
        'whitelist',
        'add',
        'alex',
      ),
    );
    expect(await screen.findByText('Alex')).toBeInTheDocument();
    await waitFor(() => expect(sendCommand).toHaveBeenCalledWith('server-1', 'whitelist add Alex'));
  });

  it('keeps the input and reports backend validation errors without replacing local data', async () => {
    playerCommands.mutatePlayerList.mockRejectedValueOnce(
      new Error('Enter a valid IPv4 or IPv6 address'),
    );
    render(<UsersView server={server} />);
    await screen.findByTestId('users-list-banned-ips');

    const input = screen.getByTestId('users-input-banned-ips') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '999.1.1.1' } });
    fireEvent.click(screen.getByTestId('users-add-banned-ips'));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Enter a valid IPv4 or IPv6 address'),
    );
    expect(input).toHaveValue('999.1.1.1');
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('explains an empty add inline, then submits the typed name from the form', async () => {
    playerCommands.mutatePlayerList.mockResolvedValueOnce({
      lists: {
        ...emptyLists,
        whitelist: [{ name: 'Alex', uuid: '0123456789abcdef0123456789abcdef' }],
      },
      changed: true,
      canonicalTarget: 'Alex',
    });
    render(<UsersView server={server} />);
    await screen.findByTestId('users-list-whitelist');

    fireEvent.click(screen.getByTestId('users-add-whitelist'));
    expect(await screen.findByText('Enter a player name to add.')).toBeInTheDocument();
    expect(playerCommands.mutatePlayerList).not.toHaveBeenCalled();

    const input = screen.getByTestId('users-input-whitelist');
    fireEvent.change(input, { target: { value: 'alex' } });
    expect(screen.queryByText('Enter a player name to add.')).not.toBeInTheDocument();
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() =>
      expect(playerCommands.mutatePlayerList).toHaveBeenCalledWith(
        'server-1',
        'whitelist',
        'add',
        'alex',
      ),
    );
  });

  it('surfaces malformed list data instead of silently rendering an empty list', async () => {
    playerCommands.getPlayerLists.mockRejectedValueOnce(new Error('Player list JSON is malformed'));
    render(<UsersView server={server} />);

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Player list JSON is malformed'),
    );
    expect(playerCommands.mutatePlayerList).not.toHaveBeenCalled();
  });
});
