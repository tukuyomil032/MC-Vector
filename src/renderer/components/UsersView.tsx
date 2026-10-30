import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import {
  getPlayerLists,
  mutatePlayerList,
  type PlayerEntry,
  type PlayerListType,
} from '../../lib/player-commands';
import { sendCommand } from '../../lib/server-commands';
import type { MinecraftServer } from '../components/../shared/server declaration';
import { notify } from '../shared/notify';
import { useAppFeedback } from './AppFeedbackProvider';
import { Button } from './ui/Button';
import { Input } from './ui/Field';

interface Props {
  server: MinecraftServer;
}

export default function UsersView({ server }: Props) {
  const { t } = useTranslation();
  const { confirm } = useAppFeedback();
  const [whitelist, setWhitelist] = useState<PlayerEntry[]>([]);
  const [ops, setOps] = useState<PlayerEntry[]>([]);
  const [bannedPlayers, setBannedPlayers] = useState<PlayerEntry[]>([]);
  const [bannedIps, setBannedIps] = useState<PlayerEntry[]>([]);
  const loadRequestId = useRef(0);
  const currentServerId = useRef(server.id);

  const applyLists = useCallback((lists: Awaited<ReturnType<typeof getPlayerLists>>) => {
    setWhitelist(lists.whitelist);
    setOps(lists.ops);
    setBannedPlayers(lists.bannedPlayers);
    setBannedIps(lists.bannedIps);
  }, []);

  const loadAllLists = useCallback(async () => {
    const requestedServerId = server.id;
    const requestId = ++loadRequestId.current;
    const lists = await getPlayerLists(requestedServerId);
    if (requestId === loadRequestId.current && currentServerId.current === requestedServerId) {
      applyLists(lists);
    }
  }, [applyLists, server.id]);

  useEffect(() => {
    currentServerId.current = server.id;
    void loadAllLists().catch((error: unknown) => {
      notify.error(error instanceof Error ? error.message : String(error));
    });
    return () => {
      loadRequestId.current += 1;
    };
  }, [loadAllLists, server.id]);

  const maybeApplyLiveCommand = async (
    type: PlayerListType,
    action: 'add' | 'remove',
    canonicalTarget: string,
  ) => {
    if (server.status !== 'online') {
      return;
    }
    const command = (() => {
      if (type === 'whitelist') {
        return `${action === 'add' ? 'whitelist add' : 'whitelist remove'} ${canonicalTarget}`;
      }
      if (type === 'ops') {
        return `${action === 'add' ? 'op' : 'deop'} ${canonicalTarget}`;
      }
      if (type === 'banned-players') {
        return `${action === 'add' ? 'ban' : 'pardon'} ${canonicalTarget}`;
      }
      return `${action === 'add' ? 'ban-ip' : 'pardon-ip'} ${canonicalTarget}`;
    })();
    await sendCommand(server.id, command);
    setTimeout(() => {
      void loadAllLists().catch((error: unknown) => {
        notify.error(error instanceof Error ? error.message : String(error));
      });
    }, 500);
  };

  const handleAdd = async (type: PlayerListType, value: string): Promise<boolean> => {
    if (!value.trim()) {
      return false;
    }
    try {
      const result = await mutatePlayerList(server.id, type, 'add', value.trim());
      if (currentServerId.current === server.id) {
        applyLists(result.lists);
      }
      if (!result.changed) {
        notify.info(t('users.toast.alreadyExists'));
        return true;
      }
      try {
        await maybeApplyLiveCommand(type, 'add', result.canonicalTarget);
        notify.success(t('users.toast.listUpdated'));
      } catch (error) {
        notify.error(
          `List was saved, but the running server command failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return true;
    } catch (error) {
      notify.error(error instanceof Error ? error.message : String(error));
      return false;
    }
  };

  const handleRemove = async (type: PlayerListType, identifier: string): Promise<void> => {
    const confirmed = await confirm({
      title: t('users.removeTitle'),
      description: t('users.confirmRemove', { name: identifier }),
      confirmLabel: t('users.actions.remove'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      const result = await mutatePlayerList(server.id, type, 'remove', identifier);
      if (currentServerId.current === server.id) {
        applyLists(result.lists);
      }
      try {
        await maybeApplyLiveCommand(type, 'remove', result.canonicalTarget);
        notify.success(t('users.toast.removed'));
      } catch (error) {
        notify.error(
          `List was saved, but the running server command failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div
      className="users-view flex h-full flex-col gap-4 p-5 max-[980px]:p-4"
      data-testid="users-view"
    >
      <div className="users-view__grid">
        <UserListCard
          title={t('users.lists.whitelist')}
          data={whitelist}
          type="whitelist"
          onAdd={(val) => handleAdd('whitelist', val)}
          onRemove={(val) => handleRemove('whitelist', val)}
          entriesLabel={t('users.entriesCount')}
          emptyLabel={t('users.empty')}
          removeLabel={t('users.actions.remove')}
          addLabel={t('users.actions.add')}
          placeholderPlayer={t('users.placeholder.playerName')}
          placeholderIp={t('users.placeholder.ipAddress')}
        />
        <UserListCard
          title={t('users.lists.operators')}
          data={ops}
          type="ops"
          onAdd={(val) => handleAdd('ops', val)}
          onRemove={(val) => handleRemove('ops', val)}
          entriesLabel={t('users.entriesCount')}
          emptyLabel={t('users.empty')}
          removeLabel={t('users.actions.remove')}
          addLabel={t('users.actions.add')}
          placeholderPlayer={t('users.placeholder.playerName')}
          placeholderIp={t('users.placeholder.ipAddress')}
        />
        <UserListCard
          title={t('users.lists.bannedPlayers')}
          data={bannedPlayers}
          type="banned-players"
          onAdd={(val) => handleAdd('banned-players', val)}
          onRemove={(val) => handleRemove('banned-players', val)}
          entriesLabel={t('users.entriesCount')}
          emptyLabel={t('users.empty')}
          removeLabel={t('users.actions.remove')}
          addLabel={t('users.actions.add')}
          placeholderPlayer={t('users.placeholder.playerName')}
          placeholderIp={t('users.placeholder.ipAddress')}
        />
        <UserListCard
          title={t('users.lists.bannedIps')}
          data={bannedIps}
          type="banned-ips"
          onAdd={(val) => handleAdd('banned-ips', val)}
          onRemove={(val) => handleRemove('banned-ips', val)}
          entriesLabel={t('users.entriesCount')}
          emptyLabel={t('users.empty')}
          removeLabel={t('users.actions.remove')}
          addLabel={t('users.actions.add')}
          placeholderPlayer={t('users.placeholder.playerName')}
          placeholderIp={t('users.placeholder.ipAddress')}
        />
      </div>
    </div>
  );
}

function UserListCard({
  title,
  data,
  type,
  onAdd,
  onRemove,
  entriesLabel,
  emptyLabel,
  removeLabel,
  addLabel,
  placeholderPlayer,
  placeholderIp,
}: {
  title: string;
  data: PlayerEntry[];
  type: PlayerListType;
  onAdd: (val: string) => Promise<boolean>;
  onRemove: (val: string) => Promise<void>;
  entriesLabel: string;
  emptyLabel: string;
  removeLabel: string;
  addLabel: string;
  placeholderPlayer: string;
  placeholderIp: string;
}) {
  const [input, setInput] = useState('');
  const { t } = useTranslation();

  const handleAddClick = async () => {
    if (!input) {
      return;
    }
    if (await onAdd(input)) {
      setInput('');
    }
  };

  return (
    <div className="users-view__card" data-testid={`users-list-${type}`}>
      <div className="users-view__card-header">
        {title}
        <span className="users-view__count">
          {data.length} {entriesLabel}
        </span>
      </div>

      <div className="users-view__list">
        {data.length === 0 ? (
          <div className="users-view__empty">{emptyLabel}</div>
        ) : (
          data.map((item) => (
            <div key={`${type}:${item.uuid ?? item.ip ?? item.name}`} className="users-view__item">
              <div className="users-view__item-main">
                {type !== 'banned-ips' && (
                  <img
                    src={`https://minotar.net/avatar/${encodeURIComponent(item.name ?? '')}/24`}
                    alt=""
                    className="users-view__avatar"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://minotar.net/avatar/MHF_Steve/24';
                    }}
                  />
                )}
                <div className="users-view__item-meta">
                  <div className="users-view__item-name">
                    {type === 'banned-ips' ? item.ip : item.name}
                  </div>
                  {item.reason && <div className="text-xs text-red-500">{item.reason}</div>}
                  {item.level && (
                    <div className="text-xs text-yellow-500">
                      {t('users.level', { level: item.level })}
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="stop"
                className="users-view__remove-btn"
                onClick={() => onRemove(type === 'banned-ips' ? item.ip || '' : item.name)}
              >
                {removeLabel}
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="users-view__form">
        <Input
          type="text"
          className="users-view__input"
          data-testid={`users-input-${type}`}
          placeholder={type === 'banned-ips' ? placeholderIp : placeholderPlayer}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddClick()}
        />
        <Button
          variant="primary"
          className="users-view__add-btn"
          data-testid={`users-add-${type}`}
          onClick={handleAddClick}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
