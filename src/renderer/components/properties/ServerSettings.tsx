import React, { useState, useEffect } from 'react';
import { type MinecraftServer } from '../../shared/server declaration';
import JavaManagerModal from '../JavaManagerModal'; // ★追加: Java管理モーダルのインポート
import '../../../main.css';

interface ServerSettingsProps {
  server: MinecraftServer;
  onSave: (updatedServer: MinecraftServer) => void;
}

const ServerSettings: React.FC<ServerSettingsProps> = ({ server, onSave }) => {
  const [name, setName] = useState(server.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [software, setSoftware] = useState((server as any).software || 'Paper');
  const [version, setVersion] = useState(server.version);
  const [memory, setMemory] = useState(server.memory);
  const [port, setPort] = useState(server.port);
  const [path, setPath] = useState(server.path);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [javaPath, setJavaPath] = useState((server as any).javaPath || '');

  // ★追加: Java管理用ステート
  const [showJavaManager, setShowJavaManager] = useState(false);
  const [installedJava, setInstalledJava] = useState<{ name: string, path: string }[]>([]);

  useEffect(() => {
    setName(server.name);
    setVersion(server.version);
    setMemory(server.memory);
    setPort(server.port);
    setPath(server.path);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((server as any).software) setSoftware((server as any).software);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((server as any).javaPath) setJavaPath((server as any).javaPath);

    // ★追加: Java一覧のロード
    loadJavaList();
  }, [server]);

  const loadJavaList = async () => {
    const list = await window.electronAPI.getJavaVersions();
    setInstalledJava(list);
  };

  // バージョンリスト
  const versionOptions = [
    '1.21.10', '1.21.9', '1.21.8', '1.21.7', '1.21.6', '1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
    '1.20.6', '1.20.5', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20',
    '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
    '1.18.2', '1.18.1', '1.18',
    '1.17.1', '1.17',
    '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1', '1.16',
    '1.15.2', '1.15.1', '1.15',
    '1.14.4', '1.14.3', '1.14.2', '1.14.1', '1.14',
    '1.13.2', '1.13.1', '1.13',
    '1.12.2', '1.12.1', '1.12',
    '1.11.2', '1.11.1', '1.11',
    '1.10.2', '1.10.1', '1.10',
    '1.9.4', '1.9.3', '1.9.2', '1.9.1', '1.9',
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
      // 拡張プロパティ
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ software, javaPath } as any)
    });
  };

  return (
    <div className="properties-container" style={{ padding: '30px', color: '#ecf0f1', maxWidth: '800px' }}>
      <h2 style={{ marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
        General Settings
      </h2>

      <div className="form-group" style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>サーバー名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
        />
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>サーバーソフトウェア</label>
          <select
            value={software}
            onChange={(e) => setSoftware(e.target.value)}
            className="input-field"
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
          <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>バージョン</label>
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="input-field"
          >
            {versionOptions.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ★変更: Java Path を選択式に変更 */}
      <div className="form-group" style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>Java Runtime</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={javaPath}
            onChange={(e) => setJavaPath(e.target.value)}
            className="input-field"
            style={{ flex: 1 }}
          >
            <option value="">System Default (Path環境変数)</option>
            {installedJava.map(j => (
              <option key={j.path} value={j.path}>{j.name} ({j.path})</option>
            ))}
          </select>
          <button
            className="btn-secondary"
            onClick={() => { setShowJavaManager(true); loadJavaList(); }}
            style={{ whiteSpace: 'nowrap' }}
          >
            Manage Java...
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>メモリ (GB)</label>
          <input
            type="number"
            value={memory}
            onChange={(e) => setMemory(Number(e.target.value))}
            className="input-field"
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>ポート</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            className="input-field"
          />
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>保存先パス</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={path}
            readOnly
            className="input-field"
            style={{ flex: 1, color: '#888', background: '#222' }}
          />
        </div>
      </div>

      <div style={{ textAlign: 'right', borderTop: '1px solid #444', paddingTop: '20px' }}>
        <button
          onClick={handleSubmit}
          className="btn-start"
          style={{ padding: '10px 24px', fontSize: '14px' }}
        >
          設定を保存
        </button>
      </div>

      {/* ★追加: モーダル表示 */}
      {showJavaManager && <JavaManagerModal onClose={() => { setShowJavaManager(false); loadJavaList(); }} />}
    </div>
  );
};

export default ServerSettings;