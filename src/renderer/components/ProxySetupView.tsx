import { ask } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { useTranslation } from '../../i18n';
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
  const { t } = useTranslation();
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
      const confirmed = await ask(t('proxySetup.confirmFewServers'), {
        title: t('proxySetup.dialogTitle'),
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
      <h2 className="proxy-setup-view__title">{t('proxySetup.title')}</h2>

      <div className="proxy-setup-view__panel">
        <div className="proxy-setup-view__field">
          <label className="proxy-setup-view__label">{t('proxySetup.proxySoftware')}</label>
          <select
            className="input-field"
            value={proxySoftware}
            onChange={(e) => setProxySoftware(e.target.value)}
          >
            <option value="Velocity">{t('proxySetup.velocityRecommended')}</option>
            <option value="Waterfall">{t('proxySetup.waterfall')}</option>
            <option value="BungeeCord">{t('proxySetup.bungeecord')}</option>
          </select>
        </div>

        <div className="proxy-setup-view__field">
          <label className="proxy-setup-view__label">{t('proxySetup.proxyPort')}</label>
          <input
            type="number"
            className="input-field"
            value={proxyPort}
            onChange={(e) => setProxyPort(Number(e.target.value))}
          />
          <div className="proxy-setup-view__hint">{t('proxySetup.portHint')}</div>
        </div>

        <div className="proxy-setup-view__field proxy-setup-view__field--large-gap">
          <label className="proxy-setup-view__label proxy-setup-view__label--spaced">
            {t('proxySetup.backendServers')}
          </label>
          <div className="proxy-setup-view__backend-list">
            {backendCandidates.length === 0 && (
              <div className="proxy-setup-view__backend-empty">
                {t('proxySetup.noBackendServers')}
              </div>
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
            {isBuilding ? t('proxySetup.building') : t('proxySetup.buildNetwork')}
          </button>

          <button className="btn-secondary proxy-setup-view__help-btn" onClick={onOpenHelp}>
            {t('proxySetup.viewHelp')}
          </button>
        </div>
      </div>
    </div>
  );
}
