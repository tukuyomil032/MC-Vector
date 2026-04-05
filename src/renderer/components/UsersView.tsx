import { useEffect, useState } from 'react';
import { readJsonFile, writeJsonFile } from '../../lib/file-commands';
import { sendCommand } from '../../lib/server-commands';
import { type MinecraftServer } from '../components/../shared/server declaration';
import { useToast } from './ToastProvider';

interface Props {
  server: MinecraftServer;
}

interface PlayerEntry {
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

type ListType = 'whitelist' | 'ops' | 'banned-players' | 'banned-ips';

export default function UsersView({ server }: Props) {
  const sep = server.path.includes('\\') ? '\\' : '/';
  const { showToast } = useToast();

  const [whitelist, setWhitelist] = useState<PlayerEntry[]>([]);
  const [ops, setOps] = useState<PlayerEntry[]>([]);
  const [bannedPlayers, setBannedPlayers] = useState<PlayerEntry[]>([]);
  const [bannedIps, setBannedIps] = useState<PlayerEntry[]>([]);

  const resolvePlayerIdentity = async (name: string): Promise<{ name: string; uuid?: string }> => {
    try {
      const res = await fetch(
        `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`,
      );
      if (!res.ok) return { name };
      const data = await res.json();
      if (data?.id) {
        return { name: data.name || name, uuid: data.id };
      }
    } catch {
      // Ignore UUID fetch errors
    }
    return { name };
  };

  const maybeApplyLiveCommand = async (
    type: ListType,
    action: 'add' | 'remove',
    nameOrIp: string,
    rawInput: string,
  ) => {
    if (server.status !== 'online') return;
    const command = (() => {
      if (type === 'whitelist')
        return `${action === 'add' ? 'whitelist add' : 'whitelist remove'} ${nameOrIp}`;
      if (type === 'ops') return `${action === 'add' ? 'op' : 'deop'} ${nameOrIp}`;
      if (type === 'banned-players') return `${action === 'add' ? 'ban' : 'pardon'} ${nameOrIp}`;
      if (type === 'banned-ips') return `${action === 'add' ? 'ban-ip' : 'pardon-ip'} ${rawInput}`;
      return '';
    })();
    if (!command) return;
    await sendCommand(server.id, command);
    setTimeout(() => loadAllLists(), 500);
  };

  useEffect(() => {
    loadAllLists();
  }, [server.path]);

  const loadAllLists = async () => {
    const [whitelistData, opsData, bannedPlayersData, bannedIpsData] = await Promise.all([
      readJsonFile(`${server.path}${sep}whitelist.json`) as Promise<PlayerEntry[] | null>,
      readJsonFile(`${server.path}${sep}ops.json`) as Promise<PlayerEntry[] | null>,
      readJsonFile(`${server.path}${sep}banned-players.json`) as Promise<PlayerEntry[] | null>,
      readJsonFile(`${server.path}${sep}banned-ips.json`) as Promise<PlayerEntry[] | null>,
    ]);

    setWhitelist(whitelistData || []);
    setOps(opsData || []);
    setBannedPlayers(bannedPlayersData || []);
    setBannedIps(bannedIpsData || []);
  };

  const handleAdd = async (type: ListType, nameOrIp: string) => {
    if (!nameOrIp) return;
    const identity = await resolvePlayerIdentity(nameOrIp);
    const filePath = `${server.path}${sep}${getFileName(type)}`;
    let currentList: PlayerEntry[] = [];
    let newItem: PlayerEntry = { name: identity.name, uuid: identity.uuid };

    switch (type) {
      case 'whitelist':
        currentList = [...whitelist];
        break;
      case 'ops':
        currentList = [...ops];
        newItem = { ...newItem, level: 4, bypassesPlayerLimit: false };
        break;
      case 'banned-players':
        currentList = [...bannedPlayers];
        newItem = {
          ...newItem,
          created: new Date().toISOString(),
          source: 'Console',
          reason: 'Banned by Admin',
        };
        break;
      case 'banned-ips':
        currentList = [...bannedIps];
        newItem = {
          ip: nameOrIp,
          name: 'unknown',
          created: new Date().toISOString(),
          source: 'Console',
          reason: 'IP Banned',
        };
        break;
    }

    if (
      currentList.some((p) =>
        type === 'banned-ips' ? p.ip === nameOrIp : p.name.toLowerCase() === nameOrIp.toLowerCase(),
      )
    ) {
      showToast('既に存在します', 'info');
      return;
    }

    const newData = [...currentList, newItem];
    await writeJsonFile(filePath, newData);
    await maybeApplyLiveCommand(type, 'add', identity.name, nameOrIp);
    showToast('リストを更新しました', 'success');

    switch (type) {
      case 'whitelist':
        setWhitelist(newData);
        break;
      case 'ops':
        setOps(newData);
        break;
      case 'banned-players':
        setBannedPlayers(newData);
        break;
      case 'banned-ips':
        setBannedIps(newData);
        break;
    }
  };

  const handleRemove = async (type: ListType, identifier: string) => {
    const filePath = `${server.path}${sep}${getFileName(type)}`;
    let currentList: PlayerEntry[] = [];

    switch (type) {
      case 'whitelist':
        currentList = whitelist;
        break;
      case 'ops':
        currentList = ops;
        break;
      case 'banned-players':
        currentList = bannedPlayers;
        break;
      case 'banned-ips':
        currentList = bannedIps;
        break;
    }

    const newData = currentList.filter((p) =>
      type === 'banned-ips' ? p.ip !== identifier : p.name !== identifier,
    );
    await writeJsonFile(filePath, newData);
    await maybeApplyLiveCommand(type, 'remove', identifier, identifier);
    showToast('削除しました', 'success');

    switch (type) {
      case 'whitelist':
        setWhitelist(newData);
        break;
      case 'ops':
        setOps(newData);
        break;
      case 'banned-players':
        setBannedPlayers(newData);
        break;
      case 'banned-ips':
        setBannedIps(newData);
        break;
    }
  };

  const getFileName = (type: ListType) => {
    if (type === 'whitelist') return 'whitelist.json';
    if (type === 'ops') return 'ops.json';
    if (type === 'banned-players') return 'banned-players.json';
    if (type === 'banned-ips') return 'banned-ips.json';
    return '';
  };

  return (
    <div className="users-view">
      <h2 className="users-view__title">User Management</h2>

      <div className="users-view__grid">
        <UserListCard
          title="Whitelist"
          data={whitelist}
          type="whitelist"
          onAdd={(val) => handleAdd('whitelist', val)}
          onRemove={(val) => handleRemove('whitelist', val)}
        />
        <UserListCard
          title="Operators (OP)"
          data={ops}
          type="ops"
          onAdd={(val) => handleAdd('ops', val)}
          onRemove={(val) => handleRemove('ops', val)}
        />
        <UserListCard
          title="Banned Players"
          data={bannedPlayers}
          type="banned-players"
          onAdd={(val) => handleAdd('banned-players', val)}
          onRemove={(val) => handleRemove('banned-players', val)}
        />
        <UserListCard
          title="Banned IPs"
          data={bannedIps}
          type="banned-ips"
          onAdd={(val) => handleAdd('banned-ips', val)}
          onRemove={(val) => handleRemove('banned-ips', val)}
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
}: {
  title: string;
  data: PlayerEntry[];
  type: ListType;
  onAdd: (val: string) => void;
  onRemove: (val: string) => void;
}) {
  const [input, setInput] = useState('');

  const handleAddClick = () => {
    if (!input) return;
    onAdd(input);
    setInput('');
  };

  return (
    <div className="users-view__card">
      <div className="users-view__card-header">
        {title}
        <span className="users-view__count">{data.length} entries</span>
      </div>

      {/* リスト表示エリア */}
      <div className="users-view__list">
        {data.length === 0 ? (
          <div className="users-view__empty">Empty</div>
        ) : (
          data.map((item, idx) => (
            <div key={idx} className="users-view__item">
              <div className="users-view__item-main">
                {/* ★ Head Image */}
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
                  {/* Additional Info */}
                  {item.reason && <div className="text-xs text-red-500">{item.reason}</div>}
                  {item.level && <div className="text-xs text-yellow-500">Level: {item.level}</div>}
                </div>
              </div>
              <button
                className="btn-stop users-view__remove-btn"
                onClick={() => onRemove(type === 'banned-ips' ? item.ip || '' : item.name)}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {/* 追加フォーム */}
      <div className="users-view__form">
        <input
          type="text"
          className="input-field users-view__input"
          placeholder={type === 'banned-ips' ? 'IP Address' : 'Player Name'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddClick()}
        />
        <button className="btn-primary users-view__add-btn" onClick={handleAddClick}>
          Add
        </button>
      </div>
    </div>
  );
}
