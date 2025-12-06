import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../shared/server declaration';
import '../../main.css';

interface Props {
  server: MinecraftServer;
}

interface PlayerEntry {
  uuid?: string;
  name: string;
  level?: number; // OP level
  bypassesPlayerLimit?: boolean;
  created?: string;
  source?: string;
  expires?: string;
  reason?: string;
}

type ListType = 'whitelist' | 'ops' | 'banned-players' | 'banned-ips';

export default function UsersView({ server }: Props) {
  const [currentTab, setCurrentTab] = useState<ListType>('whitelist');
  const [listData, setListData] = useState<PlayerEntry[]>([]);
  const [inputName, setInputName] = useState('');

  const sep = server.path.includes('\\') ? '\\' : '/';

  // ファイル名の解決
  const getFileName = (type: ListType) => {
    if (type === 'whitelist') return 'whitelist.json';
    if (type === 'ops') return 'ops.json';
    if (type === 'banned-players') return 'banned-players.json';
    if (type === 'banned-ips') return 'banned-ips.json';
    return '';
  };

  useEffect(() => {
    loadList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab, server.path]);

  const loadList = async () => {
    const fileName = getFileName(currentTab);
    const filePath = `${server.path}${sep}${fileName}`;
    const data = await window.electronAPI.readJsonFile(filePath);
    setListData(Array.isArray(data) ? data : []);
  };

  const handleAdd = async () => {
    if (!inputName) return;

    // 簡易追加: UUIDは本来Mojang APIから取得すべきだが、今回は名前のみでエントリ作成
    // オフラインモードやBungee環境下ではUUIDが変わるため、運用に合わせて調整が必要
    const newItem: PlayerEntry = {
      name: inputName,
      // OPの場合はレベルが必要
      ...(currentTab === 'ops' ? { level: 4, bypassesPlayerLimit: false } : {}),
      // BANの場合は作成日など
      ...(currentTab.includes('banned') ? { created: new Date().toISOString(), source: 'Console', reason: 'Banned by Admin' } : {})
    };

    // 既存チェック
    if (listData.some(p => p.name.toLowerCase() === inputName.toLowerCase())) {
      alert('Already exists');
      return;
    }

    const newData = [...listData, newItem];
    const fileName = getFileName(currentTab);
    const filePath = `${server.path}${sep}${fileName}`;

    await window.electronAPI.writeJsonFile(filePath, newData);
    setListData(newData);
    setInputName('');
  };

  const handleDelete = async (name: string) => {
    const newData = listData.filter(p => p.name !== name);
    const fileName = getFileName(currentTab);
    const filePath = `${server.path}${sep}${fileName}`;

    await window.electronAPI.writeJsonFile(filePath, newData);
    setListData(newData);
  };

  return (
    <div style={{ height: '100%', padding: '20px', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
        User Management
      </h2>

      {/* タブ切り替え */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button className={`btn-secondary ${currentTab === 'whitelist' ? 'active' : ''}`} onClick={() => setCurrentTab('whitelist')}>Whitelist</button>
        <button className={`btn-secondary ${currentTab === 'ops' ? 'active' : ''}`} onClick={() => setCurrentTab('ops')}>Operators (OP)</button>
        <button className={`btn-secondary ${currentTab === 'banned-players' ? 'active' : ''}`} onClick={() => setCurrentTab('banned-players')}>Banned Players</button>
        <button className={`btn-secondary ${currentTab === 'banned-ips' ? 'active' : ''}`} onClick={() => setCurrentTab('banned-ips')}>Banned IPs</button>
      </div>

      {/* 追加フォーム */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          type="text"
          className="input-field"
          placeholder={currentTab === 'banned-ips' ? "IP Address" : "Player Name"}
          value={inputName}
          onChange={e => setInputName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{ flex: 1 }}
        />
        <button className="btn-primary" onClick={handleAdd}>Add</button>
      </div>

      {/* リスト表示 */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#252526', borderRadius: '8px', padding: '10px' }}>
        {listData.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No entries found.</div>
        ) : (
          listData.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #333' }}>
              <div>
                <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                {item.uuid && <div style={{ fontSize: '0.8rem', color: '#666' }}>{item.uuid}</div>}
                {item.level && <div style={{ fontSize: '0.8rem', color: '#aaa' }}>OP Level: {item.level}</div>}
                {item.reason && <div style={{ fontSize: '0.8rem', color: '#f55' }}>Reason: {item.reason}</div>}
              </div>
              <button
                className="btn-stop"
                style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                onClick={() => handleDelete(item.name)}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}