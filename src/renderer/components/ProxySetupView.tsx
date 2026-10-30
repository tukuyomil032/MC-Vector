import { useState } from 'react';
import { useTranslation } from '../../i18n';
import type { MinecraftServer } from '../components/../shared/server declaration';
import { useAppFeedback } from './AppFeedbackProvider';
import { Button } from './ui/Button';
import { Input, NativeSelect } from './ui/Field';

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
  const { confirm } = useAppFeedback();
  const [proxySoftware, setProxySoftware] = useState('Velocity');
  const [proxyPort, setProxyPort] = useState(25577);
  const [selectedBackendIds, setSelectedBackendIds] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const proxySoftwareInputId = 'proxy-setup-software';
  const proxyPortInputId = 'proxy-setup-port';

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
    // One confirm covers the whole build. Fewer than two backends adds its warning above the rewrite notice.
    const fewBackends = selectedBackendIds.length < 2;
    const confirmed = await confirm({
      title: t('proxySetup.dialogTitle'),
      description: fewBackends
        ? t('proxySetup.confirmFewServers')
        : t('proxy.confirmRewriteProperties'),
      body: fewBackends ? t('proxy.confirmRewriteProperties') : undefined,
      confirmLabel: t('proxySetup.buildNetwork'),
    });
    if (!confirmed) return;
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
    <div
      className="proxy-setup-view box-border h-full overflow-y-auto p-8 max-[900px]:p-4"
      data-testid="proxy-view"
    >
      <div className="proxy-setup-view__inner">
        <h2 className="proxy-setup-view__title">{t('proxySetup.title')}</h2>

        <div className="proxy-setup-view__panel">
          <h3 className="proxy-setup-view__panel-title">{t('proxySetup.dialogTitle')}</h3>

          <div className="proxy-setup-view__section">
            <div className="proxy-setup-view__top-grid">
              <div className="proxy-setup-view__field">
                <label className="proxy-setup-view__label" htmlFor={proxySoftwareInputId}>
                  {t('proxySetup.proxySoftware')}
                </label>
                <NativeSelect
                  id={proxySoftwareInputId}
                  value={proxySoftware}
                  onChange={(e) => setProxySoftware(e.target.value)}
                >
                  <option value="Velocity">{t('proxySetup.velocityRecommended')}</option>
                  <option value="Waterfall">{t('proxySetup.waterfall')}</option>
                  <option value="BungeeCord">{t('proxySetup.bungeecord')}</option>
                </NativeSelect>
              </div>

              <div className="proxy-setup-view__field">
                <label className="proxy-setup-view__label" htmlFor={proxyPortInputId}>
                  {t('proxySetup.proxyPort')}
                </label>
                <Input
                  id={proxyPortInputId}
                  type="number"
                  value={proxyPort}
                  min={1}
                  max={65535}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    if (!Number.isFinite(value)) {
                      return;
                    }
                    setProxyPort(Math.min(65535, Math.max(1, value)));
                  }}
                />
                <div className="proxy-setup-view__hint">{t('proxySetup.portHint')}</div>
              </div>
            </div>
          </div>

          <div className="proxy-setup-view__section proxy-setup-view__section--large-gap">
            <div className="proxy-setup-view__field">
              <label className="proxy-setup-view__label">{t('proxySetup.backendServers')}</label>
              <div className="proxy-setup-view__backend-list">
                {backendCandidates.length === 0 && (
                  <div className="proxy-setup-view__backend-empty">
                    {t('proxySetup.noBackendServers')}
                  </div>
                )}

                {backendCandidates.map((server) => {
                  const backendCheckboxId = `proxy-backend-${server.id}`;
                  const backendDetailId = `${backendCheckboxId}-detail`;
                  const backendDetail = t('proxySetup.backendDetail', {
                    software: server.software,
                    version: server.version,
                    port: server.port,
                  });

                  return (
                    <div key={server.id} className="proxy-setup-view__backend-row">
                      <input
                        id={backendCheckboxId}
                        type="checkbox"
                        checked={selectedBackendIds.includes(server.id)}
                        onChange={() => handleCheckboxChange(server.id)}
                        className="proxy-setup-view__checkbox"
                        aria-describedby={backendDetailId}
                      />
                      <label htmlFor={backendCheckboxId} className="proxy-setup-view__backend-meta">
                        <span className="proxy-setup-view__backend-name">{server.name}</span>
                        <span id={backendDetailId} className="proxy-setup-view__backend-detail">
                          {backendDetail}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="proxy-setup-view__actions">
            <Button
              variant="start"
              className="proxy-setup-view__build-btn"
              onClick={handleBuild}
              disabled={isBuilding}
            >
              {isBuilding ? t('proxySetup.building') : t('proxySetup.buildNetwork')}
            </Button>

            <Button
              variant="secondary"
              className="proxy-setup-view__help-btn"
              onClick={onOpenHelp}
              data-testid="proxy-view-help-button"
            >
              {t('proxySetup.viewHelp')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
