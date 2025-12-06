import { useState } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';
import '../../main.css';

interface ProxySetupViewProps {
  servers: MinecraftServer[];
  onBuildNetwork: (config: ProxyNetworkConfig) => void;
}

export interface ProxyNetworkConfig {
  proxySoftware: string;
  proxyPort: number;
  backendServerIds: string[];
}

export default function ProxySetupView({ servers, onBuildNetwork }: ProxySetupViewProps) {
  const [proxySoftware, setProxySoftware] = useState('Velocity');
  const [proxyPort, setProxyPort] = useState(25577);
  const [selectedBackendIds, setSelectedBackendIds] = useState<string[]>([]);

  const handleCheckboxChange = (serverId: string) => {
    setSelectedBackendIds(prev =>
      prev.includes(serverId)
        ? prev.filter(id => id !== serverId)
        : [...prev, serverId]
    );
  };

  const handleBuild = () => {
    if (selectedBackendIds.length === 0) {
      alert("接続するサーバーを少なくとも1つ選択してください");
      return;
    }
    onBuildNetwork({
      proxySoftware,
      proxyPort,
      backendServerIds: selectedBackendIds
    });
  };

  const openHelp = () => {
    window.electronAPI.openProxyHelpWindow();
  };

  return (
    <div style={{ height: '100%', padding: '40px', overflowY: 'auto', color: '#fff' }}>
      <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
        Proxy Network Setup
      </h2>

      {/* ★修正: 説明文を変更 */}
      <p style={{ color: '#aaa', marginBottom: '30px' }}>
        複数のサーバーを接続してネットワークを構築します。各サーバーの設定(ポート、転送設定)を自動で書き換えます。
      </p>

      <div className="setting-card" style={{ padding: '30px', maxWidth: '800px', background: '#252526' }}>

        <div className="form-group" style={{ marginBottom: '25px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Proxy Software</label>
          <select
            className="input-field"
            value={proxySoftware}
            onChange={(e) => setProxySoftware(e.target.value)}
          >
            <option value="Velocity">Velocity (Recommended)</option>
            <option value="Waterfall">Waterfall</option>
            <option value="BungeeCord">BungeeCord</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: '25px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Proxy Port</label>
          <input
            type="number"
            className="input-field"
            value={proxyPort}
            onChange={(e) => setProxyPort(Number(e.target.value))}
          />
          <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '5px' }}>
            プレイヤーが最初に接続するポートです (デフォルト: 25577)
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>Backend Servers</label>
          <div style={{ background: '#1e1e1e', padding: '10px', borderRadius: '4px', border: '1px solid #444', maxHeight: '200px', overflowY: 'auto' }}>
            {servers.length === 0 && <div style={{color: '#666', padding: '10px'}}>サーバーがありません</div>}
            {servers.map(server => (
              <div key={server.id} style={{ display: 'flex', alignItems: 'center', padding: '8px', borderBottom: '1px solid #333' }}>
                <input
                  type="checkbox"
                  checked={selectedBackendIds.includes(server.id)}
                  onChange={() => handleCheckboxChange(server.id)}
                  style={{ marginRight: '10px', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 'bold' }}>{server.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#aaa' }}>{server.software} {server.version} (Port: {server.port})</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button
            className="btn-start"
            onClick={handleBuild}
            style={{ padding: '12px 24px', fontSize: '1rem' }}
          >
            ネットワーク構築を実行
          </button>

          {/* ★追加: ヘルプボタン */}
          <button
            className="btn-secondary"
            onClick={openHelp}
            style={{ padding: '12px 20px', fontSize: '0.9rem' }}
          >
            設定方法の詳細を見る
          </button>
        </div>

      </div>
    </div>
  );
}