import React, { useState, useEffect } from 'react';
import { type MinecraftServer } from '../../shared/server declaration';
// 必要であれば CSS をインポート
import '../../../main.css';

interface ServerSettingsProps {
  server: MinecraftServer;
  onSave: (updatedServer: MinecraftServer) => void;
}

const ServerSettings: React.FC<ServerSettingsProps> = ({ server, onSave }) => {
  const [name, setName] = useState(server.name);
  const [software, setSoftware] = useState((server as any).software || 'Paper');
  const [version, setVersion] = useState(server.version);
  const [memory, setMemory] = useState(server.memory);
  const [port, setPort] = useState(server.port);
  const [path, setPath] = useState(server.path);

  useEffect(() => {
    setName(server.name);
    setVersion(server.version);
    setMemory(server.memory);
    setPort(server.port);
    setPath(server.path);
    if ((server as any).software) {
      setSoftware((server as any).software);
    }
  }, [server]);

  // バージョンリスト (AddServerModalと同期)
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

  const handleSubmit = () => {
    onSave({
      ...server,
      name,
      version,
      memory,
      port,
      path,
      ...({ software } as any)
    });
    alert('設定を保存しました');
  };

  return (
    <div className="properties-container" style={{ padding: '30px', color: '#ecf0f1', maxWidth: '800px' }}>
      <h2 style={{ marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
        General Settings
      </h2>

      {/* サーバー名 */}
      <div className="form-group" style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>サーバー名</label>
        <input 
          type="text" 
          value={name} 
          onChange={(e) => setName(e.target.value)}
          className="input-field" 
          style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        {/* ソフトウェア選択 */}
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>サーバーソフトウェア</label>
          <select 
            value={software} 
            onChange={(e) => setSoftware(e.target.value)}
            className="input-field"
            style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
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

        {/* バージョン選択 */}
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>バージョン</label>
          <select 
            value={version} 
            onChange={(e) => setVersion(e.target.value)}
            className="input-field"
            style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
          >
            {versionOptions.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
        {/* メモリ */}
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>メモリ (GB)</label>
          <input 
            type="number" 
            value={memory} 
            onChange={(e) => setMemory(Number(e.target.value))}
            className="input-field"
            style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
          />
        </div>
        {/* ポート */}
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>ポート</label>
          <input 
            type="number" 
            value={port} 
            onChange={(e) => setPort(Number(e.target.value))}
            className="input-field"
            style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
          />
        </div>
      </div>

      {/* JARパス (保存先パス) */}
      <div className="form-group" style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>保存先パス</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            value={path} 
            readOnly
            className="input-field"
            style={{ flex: 1, padding: '10px', background: '#333', border: '1px solid #444', color: '#aaa', borderRadius: '4px' }}
          />
          <button style={{ padding: '0 20px', background: '#444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            参照
          </button>
        </div>
      </div>

      <div style={{ textAlign: 'right', borderTop: '1px solid #444', paddingTop: '20px' }}>
        <button 
          onClick={handleSubmit}
          className="btn-start"
          style={{ padding: '10px 24px', background: '#5865F2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
        >
          設定を保存
        </button>
      </div>
    </div>
  );
};

export default ServerSettings;