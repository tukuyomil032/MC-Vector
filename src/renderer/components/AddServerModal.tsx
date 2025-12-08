import React, { useState, useEffect } from 'react';

interface AddServerModalProps {
  onClose: () => void;
  onAdd: (serverData: any) => void;
}

const AddServerModal: React.FC<AddServerModalProps> = ({ onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [software, setSoftware] = useState('Paper');
  const [version, setVersion] = useState('1.21.10');
  const [port, setPort] = useState(25565);
  const [memory, setMemory] = useState(4);
  const [rootPath, setRootPath] = useState<string>('');

  useEffect(() => {
    const fetchRoot = async () => {
      try {
        const path = await window.electronAPI.getServerRoot();
        setRootPath(path);
      } catch (e) {
        console.error(e);
      }
    };
    fetchRoot();
  }, []);

  const previewPath = rootPath ? `${rootPath}/${name || 'server-id'}`.replace(/\\/g, '/') : 'Loading...';

  const versionOptions = [
    // 1.21.x
    '1.21.10', '1.21.9', '1.21.8', '1.21.7', '1.21.6', '1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
    // 1.20.x
    '1.20.6', '1.20.5', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20',
    // 1.19.x
    '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
    // 1.18.x
    '1.18.2', '1.18.1', '1.18',
    // 1.17.x
    '1.17.1', '1.17',
    // 1.16.x
    '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1', '1.16',
    // 1.15.x
    '1.15.2', '1.15.1', '1.15',
    // 1.14.x
    '1.14.4', '1.14.3', '1.14.2', '1.14.1', '1.14',
    // 1.13.x
    '1.13.2', '1.13.1', '1.13',
    // 1.12.x
    '1.12.2', '1.12.1', '1.12',
    // 1.11.x
    '1.11.2', '1.11.1', '1.11',
    // 1.10.x
    '1.10.2', '1.10.1', '1.10',
    // 1.9.x
    '1.9.4', '1.9.3', '1.9.2', '1.9.1', '1.9',
    // 1.8.x
    '1.8.9'
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({ name, software, version, port, memory });
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#2c2c2c', padding: '20px', borderRadius: '8px',
        width: '450px', color: '#fff', border: '1px solid #444',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>新しいサーバーを追加</h3>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#ccc' }}>サーバー名</label>
            <input
              type="text" required
              value={name} onChange={e => setName(e.target.value)}
              placeholder="例: Survival Server"
              style={{ width: '100%', padding: '10px', background: '#444', border: '1px solid #555', borderRadius: '4px', color: '#fff', fontSize: '1rem' }}
            />
            <div style={{
              marginTop: '5px',
              fontSize: '0.75rem',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              color: '#888',
              background: '#1a1a1a',
              padding: '4px 8px',
              borderRadius: '3px',
              wordBreak: 'break-all'
            }}>
              保存先: {previewPath}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#ccc' }}>ソフトウェア</label>
              <select
                value={software} onChange={e => setSoftware(e.target.value)}
                style={{ width: '100%', padding: '10px', background: '#444', border: '1px solid #555', borderRadius: '4px', color: '#fff' }}
              >
                <optgroup label="Standard">
                  <option value="Vanilla">Vanilla (公式)</option>
                  <option value="Paper">Paper (推奨)</option>
                  <option value="LeafMC">LeafMC (Paper Fork)</option>
                  <option value="Spigot">Spigot</option>
                </optgroup>
                <optgroup label="Modded">
                  <option value="Fabric">Fabric</option>
                  <option value="Forge">Forge</option>
                </optgroup>
                <optgroup label="Proxy">
                  <option value="Velocity">Velocity</option>
                  <option value="Waterfall">Waterfall</option>
                  <option value="BungeeCord">BungeeCord</option>
                </optgroup>
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#ccc' }}>バージョン</label>
              <select
                value={version} onChange={e => setVersion(e.target.value)}
                style={{ width: '100%', padding: '10px', background: '#444', border: '1px solid #555', borderRadius: '4px', color: '#fff' }}
              >
                 {versionOptions.map(v => (
                   <option key={v} value={v}>{v}</option>
                 ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#ccc' }}>ポート</label>
              <input
                type="number" required
                value={port} onChange={e => setPort(Number(e.target.value))}
                style={{ width: '100%', padding: '10px', background: '#444', border: '1px solid #555', borderRadius: '4px', color: '#fff' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#ccc' }}>メモリ(GB)</label>
              <input
                type="number" required
                value={memory} onChange={e => setMemory(Number(e.target.value))}
                style={{ width: '100%', padding: '10px', background: '#444', border: '1px solid #555', borderRadius: '4px', color: '#fff' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #444', paddingTop: '15px' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #666', color: '#ccc', borderRadius: '4px', cursor: 'pointer' }}>キャンセル</button>
            <button type="submit" style={{ padding: '10px 20px', background: '#5865F2', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>作成</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddServerModal;