import React, { useState } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';

export interface ProxyNetworkConfig {
  proxySoftware: 'Velocity' | 'Waterfall' | 'BungeeCord';
  proxyPort: number;
  backendServerIds: string[];
}

interface ProxySetupProps {
  servers: MinecraftServer[];
  onBuildNetwork: (config: ProxyNetworkConfig) => void;
}

const ProxySetupView: React.FC<ProxySetupProps> = ({ servers, onBuildNetwork }) => {
  const [proxySoftware, setProxySoftware] = useState<'Velocity' | 'Waterfall' | 'BungeeCord'>('Velocity');
  const [proxyPort, setProxyPort] = useState(25565);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);

  // サーバー選択の切り替え
  const toggleServer = (id: string) => {
    setSelectedServerIds(prev => 
      prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
    );
  };

  // 構築ボタンクリック時
  const handleBuild = () => {
    if (selectedServerIds.length < 2) {
      alert("最低2つのサーバーを選択してください！");
      return;
    }
    onBuildNetwork({
      proxySoftware,
      proxyPort,
      backendServerIds: selectedServerIds
    });
  };

  return (
    <div style={{ padding: '30px', color: '#ecf0f1', maxWidth: '800px' }}>
      <h2 style={{ borderBottom: '1px solid #444', paddingBottom: '10px', marginBottom: '20px' }}>
        Proxy Network Setup
      </h2>
      
      <p style={{ color: '#aaa', marginBottom: '20px' }}>
        複数のサーバーを接続してネットワークを構築します。プロキシサーバーを自動生成し、各サーバーの設定（ポート、転送設定）を自動で書き換えます。
      </p>

      {/* 1. プロキシ設定エリア */}
      <div style={{ background: '#2c3e50', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
        <h4 style={{ marginTop: 0, marginBottom: '15px' }}>1. プロキシサーバーの設定</h4>
        <div style={{ display: 'flex', gap: '20px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>ソフトウェア</label>
            <select 
              value={proxySoftware}
              onChange={(e) => setProxySoftware(e.target.value as any)}
              className="input-field" // main.cssのクラス
              style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
            >
              <option value="Velocity">Velocity (推奨 / 最新)</option>
              <option value="Waterfall">Waterfall (安定 / 旧Paper系)</option>
              <option value="BungeeCord">BungeeCord (標準)</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>公開ポート</label>
            <input 
              type="number" 
              value={proxyPort}
              onChange={(e) => setProxyPort(Number(e.target.value))}
              className="input-field"
              style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
            />
          </div>
        </div>
      </div>

      {/* 2. 接続先サーバー選択エリア */}
      <div style={{ marginBottom: '30px' }}>
        <h4 style={{ marginBottom: '15px' }}>2. 接続するサーバーを選択 (最低2つ)</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
          {servers.map(server => (
            <div 
              key={server.id} 
              onClick={() => toggleServer(server.id)}
              style={{ 
                padding: '15px', 
                background: selectedServerIds.includes(server.id) ? 'rgba(52, 152, 219, 0.2)' : '#222', 
                border: selectedServerIds.includes(server.id) ? '2px solid #3498db' : '2px solid #444',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'all 0.2s'
              }}
            >
              <input 
                type="checkbox" 
                checked={selectedServerIds.includes(server.id)}
                onChange={() => {}} // 親divのonClickで処理するため空
                style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontWeight: 'bold' }}>{server.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#aaa' }}>{server.version} / Port: {server.port}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 実行ボタン */}
      <div style={{ borderTop: '1px solid #444', paddingTop: '20px', textAlign: 'right' }}>
        <button 
          onClick={handleBuild}
          className="btn-start" // main.cssのクラス
          style={{ 
            padding: '12px 30px', 
            fontSize: '1rem', 
            background: selectedServerIds.length < 2 ? '#555' : '#27ae60', 
            cursor: selectedServerIds.length < 2 ? 'not-allowed' : 'pointer',
            border: 'none',
            color: '#fff',
            borderRadius: '4px'
          }}
          disabled={selectedServerIds.length < 2}
        >
          ネットワーク構築を実行
        </button>
      </div>
    </div>
  );
};

export default ProxySetupView;