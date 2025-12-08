import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';
import '../../main.css';

interface Props {
  server: MinecraftServer;
}

// 共通のプレイヤーデータ型
interface PlayerEntry {
  uuid?: string;
  name: string;
  level?: number;
  created?: string;
  source?: string;
  expires?: string;
  reason?: string;
  ip?: string; // for banned-ips
}

type ListType = 'whitelist' | 'ops' | 'banned-players' | 'banned-ips';

export default function UsersView({ server }: Props) {
  const sep = server.path.includes('\\') ? '\\' : '/';

  // 4つのリストデータを個別に管理
  const [whitelist, setWhitelist] = useState<PlayerEntry[]>([]);
  const [ops, setOps] = useState<PlayerEntry[]>([]);
  const [bannedPlayers, setBannedPlayers] = useState<PlayerEntry[]>([]);
  const [bannedIps, setBannedIps] = useState<PlayerEntry[]>([]);

  // 初期ロード
  useEffect(() => {
    loadAllLists();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.path]);

  const loadAllLists = async () => {
    setWhitelist(await window.electronAPI.readJsonFile(`${server.path}${sep}whitelist.json`) || []);
    setOps(await window.electronAPI.readJsonFile(`${server.path}${sep}ops.json`) || []);
    setBannedPlayers(await window.electronAPI.readJsonFile(`${server.path}${sep}banned-players.json`) || []);
    setBannedIps(await window.electronAPI.readJsonFile(`${server.path}${sep}banned-ips.json`) || []);
  };

  // 追加処理
  const handleAdd = async (type: ListType, nameOrIp: string) => {
    if (!nameOrIp) return;
    const filePath = `${server.path}${sep}${getFileName(type)}`;
    let currentList: PlayerEntry[] = [];
    let newItem: PlayerEntry = { name: nameOrIp };

    switch(type) {
      case 'whitelist': currentList = [...whitelist]; break;
      case 'ops': 
        currentList = [...ops]; 
        newItem = { ...newItem, level: 4, bypassesPlayerLimit: false } as any; 
        break;
      case 'banned-players': 
        currentList = [...bannedPlayers]; 
        newItem = { ...newItem, created: new Date().toISOString(), source: 'Console', reason: 'Banned by Admin' }; 
        break;
      case 'banned-ips': 
        currentList = [...bannedIps]; 
        newItem = { ip: nameOrIp, name: 'unknown', created: new Date().toISOString(), source: 'Console', reason: 'IP Banned' }; 
        break;
    }

    // 重複チェック (簡易)
    if (currentList.some(p => (type === 'banned-ips' ? p.ip === nameOrIp : p.name.toLowerCase() === nameOrIp.toLowerCase()))) {
      alert('Already exists');
      return;
    }

    const newData = [...currentList, newItem];
    await window.electronAPI.writeJsonFile(filePath, newData);
    
    // State更新
    switch(type) {
        case 'whitelist': setWhitelist(newData); break;
        case 'ops': setOps(newData); break;
        case 'banned-players': setBannedPlayers(newData); break;
        case 'banned-ips': setBannedIps(newData); break;
    }
  };

  // 削除処理
  const handleRemove = async (type: ListType, identifier: string) => {
    const filePath = `${server.path}${sep}${getFileName(type)}`;
    let currentList: PlayerEntry[] = [];

    switch(type) {
        case 'whitelist': currentList = whitelist; break;
        case 'ops': currentList = ops; break;
        case 'banned-players': currentList = bannedPlayers; break;
        case 'banned-ips': currentList = bannedIps; break;
    }

    const newData = currentList.filter(p => (type === 'banned-ips' ? p.ip !== identifier : p.name !== identifier));
    await window.electronAPI.writeJsonFile(filePath, newData);

    switch(type) {
        case 'whitelist': setWhitelist(newData); break;
        case 'ops': setOps(newData); break;
        case 'banned-players': setBannedPlayers(newData); break;
        case 'banned-ips': setBannedIps(newData); break;
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
    <div style={{ height: '100%', padding: '20px', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
        User Management
      </h2>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gridTemplateRows: '1fr 1fr', 
        gap: '20px', 
        flex: 1,
        minHeight: 0 // コンテンツがあふれないように
      }}>
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

// 個別のリストカードコンポーネント
function UserListCard({ title, data, type, onAdd, onRemove }: { 
    title: string, 
    data: PlayerEntry[], 
    type: ListType,
    onAdd: (val: string) => void, 
    onRemove: (val: string) => void 
}) {
    const [input, setInput] = useState('');

    const handleAddClick = () => {
        if(!input) return;
        onAdd(input);
        setInput('');
    };

    return (
        <div style={{ 
            backgroundColor: '#252526', 
            borderRadius: '8px', 
            border: '1px solid #444', 
            display: 'flex', 
            flexDirection: 'column', 
            overflow: 'hidden' 
        }}>
            <div style={{ 
                padding: '10px 15px', 
                backgroundColor: '#333', 
                fontWeight: 'bold', 
                borderBottom: '1px solid #444',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                {title}
                <span style={{ fontSize: '0.8rem', color: '#aaa', fontWeight: 'normal' }}>{data.length} entries</span>
            </div>
            
            {/* リスト表示エリア */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                {data.length === 0 ? (
                    <div style={{ color: '#666', textAlign: 'center', marginTop: '20px' }}>Empty</div>
                ) : (
                    data.map((item, idx) => (
                        <div key={idx} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            padding: '8px', 
                            marginBottom: '5px',
                            backgroundColor: '#2b2b2b',
                            borderRadius: '4px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {/* ★ Head Image */}
                                {type !== 'banned-ips' && (
                                    <img 
                                        src={`https://minotar.net/avatar/${item.name}/24`} 
                                        alt="" 
                                        style={{ borderRadius: '4px', width: '24px', height: '24px' }}
                                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://minotar.net/avatar/MHF_Steve/24' }} 
                                    />
                                )}
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                                        {type === 'banned-ips' ? item.ip : item.name}
                                    </div>
                                    {/* Additional Info */}
                                    {item.reason && <div style={{ fontSize: '0.7rem', color: '#ed4245' }}>{item.reason}</div>}
                                    {item.level && <div style={{ fontSize: '0.7rem', color: '#faa61a' }}>Level: {item.level}</div>}
                                </div>
                            </div>
                            <button 
                                className="btn-stop" 
                                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                onClick={() => onRemove(type === 'banned-ips' ? item.ip || '' : item.name)}
                            >
                                Remove
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* 追加フォーム */}
            <div style={{ padding: '10px', borderTop: '1px solid #444', display: 'flex', gap: '5px' }}>
                <input 
                    type="text" 
                    className="input-field" 
                    placeholder={type === 'banned-ips' ? "IP Address" : "Player Name"}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddClick()}
                    style={{ flex: 1, padding: '6px' }}
                />
                <button 
                    className="btn-primary" 
                    onClick={handleAddClick}
                    style={{ padding: '6px 12px' }}
                >
                    Add
                </button>
            </div>
        </div>
    );
}