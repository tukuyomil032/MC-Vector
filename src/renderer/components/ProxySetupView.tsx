import { ask } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';

interface ProxySetupViewProps {
  servers: MinecraftServer[];
  onBuildNetwork: (config: ProxyNetworkConfig) => Promise<void> | void;
  onOpenHelp: () => void;
}

export interface ProxyNetworkConfig {
  proxySoftware: string;
  proxyPort: number;
  backendServerIds: string[];
}

export default function ProxySetupView({
  servers,
  onBuildNetwork,
  onOpenHelp,
}: ProxySetupViewProps) {
  const [proxySoftware, setProxySoftware] = useState('Velocity');
  const [proxyPort, setProxyPort] = useState(25577);
  const [selectedBackendIds, setSelectedBackendIds] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);

  const backendCandidates = servers.filter(
    (s) =>
      !['Velocity', 'Waterfall', 'BungeeCord'].includes(s.software) &&
      !s.name.toLowerCase().includes('proxy'),
  );

  const handleCheckboxChange = (serverId: string) => {
    setSelectedBackendIds((prev) =>
      prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId],
    );
  };

  const handleBuild = async () => {
    if (isBuilding) {
      return;
    }
    if (selectedBackendIds.length < 2) {
      const confirmed = await ask('接続するサーバーが1つ以下です。ネットワークを構築しますか？', {
        title: 'プロキシ構成',
        kind: 'warning',
      });
      if (!confirmed) return;
    }
    setIsBuilding(true);
    try {
      await onBuildNetwork({
        proxySoftware,
        proxyPort,
        backendServerIds: selectedBackendIds,
      });
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div className="proxy-setup-view">
      <h2 className="proxy-setup-view__title">Proxy Network Setup</h2>

      <div className="proxy-setup-view__panel">
        <div className="proxy-setup-view__field">
          <label className="proxy-setup-view__label">Proxy Software</label>
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

        <div className="proxy-setup-view__field">
          <label className="proxy-setup-view__label">Proxy Port</label>
          <input
            type="number"
            className="input-field"
            value={proxyPort}
            onChange={(e) => setProxyPort(Number(e.target.value))}
          />
          <div className="proxy-setup-view__hint">
            プレイヤーが最初に接続するポートです (デフォルト: 25577)
          </div>
        </div>

        <div className="proxy-setup-view__field proxy-setup-view__field--large-gap">
          <label className="proxy-setup-view__label proxy-setup-view__label--spaced">
            Backend Servers (接続先)
          </label>
          <div className="proxy-setup-view__backend-list">
            {backendCandidates.length === 0 && (
              <div className="proxy-setup-view__backend-empty">接続可能なサーバーがありません</div>
            )}

            {backendCandidates.map((server) => (
              <div key={server.id} className="proxy-setup-view__backend-row">
                <input
                  type="checkbox"
                  checked={selectedBackendIds.includes(server.id)}
                  onChange={() => handleCheckboxChange(server.id)}
                  className="proxy-setup-view__checkbox"
                />
                <div className="proxy-setup-view__backend-meta">
                  <div className="proxy-setup-view__backend-name">{server.name}</div>
                  <div className="proxy-setup-view__backend-detail">
                    {server.software} {server.version} (Port: {server.port})
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="proxy-setup-view__actions">
          <button
            className="btn-start proxy-setup-view__build-btn disabled:opacity-50"
            onClick={handleBuild}
            disabled={isBuilding}
          >
            {isBuilding ? '実行中...' : 'ネットワーク構築を実行'}
          </button>

          <button className="btn-secondary proxy-setup-view__help-btn" onClick={onOpenHelp}>
            設定方法の詳細を見る
          </button>
        </div>
      </div>
    </div>
  );
}
