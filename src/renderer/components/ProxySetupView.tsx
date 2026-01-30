import { useState } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';

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

  const backendCandidates = servers.filter(
    (s) =>
      !['Velocity', 'Waterfall', 'BungeeCord'].includes(s.software) &&
      !s.name.toLowerCase().includes('proxy')
  );

  const handleCheckboxChange = (serverId: string) => {
    setSelectedBackendIds((prev) =>
      prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId]
    );
  };

  const handleBuild = () => {
    if (selectedBackendIds.length < 2) {
      if (!window.confirm('接続するサーバーが1つ以下です。ネットワークを構築しますか？')) return;
    }
    onBuildNetwork({
      proxySoftware,
      proxyPort,
      backendServerIds: selectedBackendIds,
    });
  };

  const openHelp = () => {
    window.electronAPI.openProxyHelpWindow();
  };

  return (
    <div className="h-full p-10 overflow-y-auto text-white">
      <h2 className="mt-0 mb-5 border-b border-zinc-700 pb-2.5">Proxy Network Setup</h2>

      <p className="text-zinc-400 mb-8">
        複数のサーバーを接続してネットワークを構築します。各サーバーの設定(ポート、転送設定)を自動で書き換えます。
      </p>

      <div className="p-8 max-w-4xl bg-[#252526] rounded-lg border border-border-color">
        <div className="mb-6 flex flex-col gap-2">
          <label className="block mb-2 font-bold">Proxy Software</label>
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

        <div className="mb-6 flex flex-col gap-2">
          <label className="block mb-2 font-bold">Proxy Port</label>
          <input
            type="number"
            className="input-field"
            value={proxyPort}
            onChange={(e) => setProxyPort(Number(e.target.value))}
          />
          <div className="text-xs text-zinc-500 mt-1.5">
            プレイヤーが最初に接続するポートです (デフォルト: 25577)
          </div>
        </div>

        <div className="mb-8 flex flex-col gap-2">
          <label className="block mb-2.5 font-bold">Backend Servers (接続先)</label>
          <div className="bg-[#1e1e1e] p-2.5 rounded border border-zinc-700 max-h-[200px] overflow-y-auto">
            {backendCandidates.length === 0 && (
              <div className="text-zinc-600 p-2.5">接続可能なサーバーがありません</div>
            )}

            {backendCandidates.map((server) => (
              <div key={server.id} className="flex items-center p-2 border-b border-zinc-800">
                <input
                  type="checkbox"
                  checked={selectedBackendIds.includes(server.id)}
                  onChange={() => handleCheckboxChange(server.id)}
                  className="mr-2.5 cursor-pointer"
                />
                <div>
                  <div className="font-bold">{server.name}</div>
                  <div className="text-xs text-zinc-400">
                    {server.software} {server.version} (Port: {server.port})
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="btn-start py-3 px-6 text-base" onClick={handleBuild}>
            ネットワーク構築を実行
          </button>

          <button className="btn-secondary py-3 px-5 text-sm" onClick={openHelp}>
            設定方法の詳細を見る
          </button>
        </div>
      </div>
    </div>
  );
}
