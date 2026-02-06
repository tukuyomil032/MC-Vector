import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';
import { useToast } from './ToastProvider';
import { sendCommand } from '../../lib/server-commands';
import { readJsonFile, writeJsonFile } from '../../lib/file-commands';

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
        `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`
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
    rawInput: string
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
    setWhitelist(
      ((await readJsonFile(`${server.path}${sep}whitelist.json`)) as PlayerEntry[] | null) || []
    );
    setOps(((await readJsonFile(`${server.path}${sep}ops.json`)) as PlayerEntry[] | null) || []);
    setBannedPlayers(
      ((await readJsonFile(`${server.path}${sep}banned-players.json`)) as PlayerEntry[] | null) ||
        []
    );
    setBannedIps(
      ((await readJsonFile(`${server.path}${sep}banned-ips.json`)) as PlayerEntry[] | null) || []
    );
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
        newItem = { ...newItem, level: 4, bypassesPlayerLimit: false } as any;
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
        type === 'banned-ips' ? p.ip === nameOrIp : p.name.toLowerCase() === nameOrIp.toLowerCase()
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
      type === 'banned-ips' ? p.ip !== identifier : p.name !== identifier
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
    <div className="h-full p-5 flex flex-col">
      <h2 className="mt-0 mb-5 border-b border-zinc-700 pb-2.5">User Management</h2>

      <div className="grid grid-cols-2 grid-rows-2 gap-5 flex-1 min-h-0">
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
    <div className="bg-[#252526] rounded-lg border border-zinc-700 flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 bg-zinc-800 font-bold border-b border-zinc-700 flex justify-between items-center">
        {title}
        <span className="text-xs text-zinc-400 font-normal">{data.length} entries</span>
      </div>

      {/* リスト表示エリア */}
      <div className="flex-1 overflow-y-auto p-2.5">
        {data.length === 0 ? (
          <div className="text-zinc-600 text-center mt-5">Empty</div>
        ) : (
          data.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2 mb-1.5 bg-[#2b2b2b] rounded"
            >
              <div className="flex items-center gap-2.5">
                {/* ★ Head Image */}
                {type !== 'banned-ips' && (
                  <img
                    src={`https://minotar.net/avatar/${encodeURIComponent(item.name ?? '')}/24`}
                    alt=""
                    className="rounded w-6 h-6"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://minotar.net/avatar/MHF_Steve/24';
                    }}
                  />
                )}
                <div>
                  <div className="font-bold text-sm">
                    {type === 'banned-ips' ? item.ip : item.name}
                  </div>
                  {/* Additional Info */}
                  {item.reason && <div className="text-xs text-red-500">{item.reason}</div>}
                  {item.level && <div className="text-xs text-yellow-500">Level: {item.level}</div>}
                </div>
              </div>
              <button
                className="btn-stop py-0.5 px-2 text-xs"
                onClick={() => onRemove(type === 'banned-ips' ? item.ip || '' : item.name)}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {/* 追加フォーム */}
      <div className="p-2.5 border-t border-zinc-700 flex gap-1.5">
        <input
          type="text"
          className="input-field flex-1 py-1.5"
          placeholder={type === 'banned-ips' ? 'IP Address' : 'Player Name'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddClick()}
        />
        <button className="btn-primary py-1.5 px-3" onClick={handleAddClick}>
          Add
        </button>
      </div>
    </div>
  );
}
