import { Button } from '@/components/arc/button/button';
import { Card } from '@/components/arc/card/card';
import { Checkbox } from '@/components/arc/checkbox/checkbox';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { NumberField } from '@/components/arc/number-field/number-field';
import { Select } from '@/components/arc/select/select';
import { useState } from 'react';
import { useTranslation } from '../../i18n';
import type { MinecraftServer } from '../shared/server declaration';
import { useAppFeedback } from './AppFeedbackProvider';
import styles from './ProxySetupView.module.css';

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

  const backendCandidates = servers.filter(
    (s) =>
      !['Velocity', 'Waterfall', 'BungeeCord'].includes(s.software) &&
      !s.name.toLowerCase().includes('proxy'),
  );
  const selectedCount = backendCandidates.filter((server) =>
    selectedBackendIds.includes(server.id),
  ).length;
  const allSelected = backendCandidates.length > 0 && selectedCount === backendCandidates.length;
  const selectAllState = allSelected ? true : selectedCount > 0 ? 'indeterminate' : false;

  const toggleBackend = (serverId: string) => {
    setSelectedBackendIds((prev) =>
      prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId],
    );
  };

  const toggleAllBackends = () => {
    setSelectedBackendIds(allSelected ? [] : backendCandidates.map((server) => server.id));
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

  const softwareOptions = [
    { value: 'Velocity', label: t('proxySetup.velocityRecommended') },
    { value: 'Waterfall', label: t('proxySetup.waterfall') },
    { value: 'BungeeCord', label: t('proxySetup.bungeecord') },
  ];

  return (
    <div className={styles.root} data-testid="proxy-view">
      <div className={styles.inner}>
        <Card title={t('proxySetup.dialogTitle')} className={styles.card}>
          <div className={styles.fields}>
            <Select
              id="proxy-setup-software"
              label={t('proxySetup.proxySoftware')}
              options={softwareOptions}
              value={proxySoftware}
              onValueChange={setProxySoftware}
              disabled={isBuilding}
            />
            <NumberField
              id="proxy-setup-port"
              label={t('proxySetup.proxyPort')}
              description={t('proxySetup.portHint')}
              value={proxyPort}
              min={1}
              max={65535}
              formatOptions={{ useGrouping: false }}
              onValueChange={setProxyPort}
              disabled={isBuilding}
            />
          </div>

          <section className={styles.section} aria-labelledby="proxy-setup-backends">
            <div className={styles.sectionHead}>
              <h3 id="proxy-setup-backends" className={styles.sectionTitle}>
                {t('proxySetup.backendServers')}
              </h3>
              {backendCandidates.length > 0 && (
                <span className={styles.count}>
                  {t('proxySetup.selectedCount', {
                    selected: selectedCount,
                    total: backendCandidates.length,
                  })}
                </span>
              )}
            </div>

            {backendCandidates.length === 0 ? (
              <EmptyState
                title={t('proxySetup.noBackendServers')}
                description={t('proxySetup.noBackendServersHint')}
              />
            ) : (
              <div className={styles.backendList}>
                <Checkbox
                  checked={selectAllState}
                  onCheckedChange={toggleAllBackends}
                  disabled={isBuilding}
                  label={t('proxySetup.selectAll')}
                />
                {backendCandidates.map((server) => (
                  <Checkbox
                    key={server.id}
                    id={`proxy-backend-${server.id}`}
                    checked={selectedBackendIds.includes(server.id)}
                    onCheckedChange={() => toggleBackend(server.id)}
                    disabled={isBuilding}
                    label={server.name}
                    description={t('proxySetup.backendDetail', {
                      software: server.software,
                      version: server.version,
                      port: server.port,
                    })}
                  />
                ))}
              </div>
            )}
          </section>

          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              data-testid="proxy-view-help-button"
              onClick={onOpenHelp}
            >
              {t('proxySetup.viewHelp')}
            </Button>
            <Button type="button" variant="primary" loading={isBuilding} onClick={handleBuild}>
              {isBuilding ? t('proxySetup.building') : t('proxySetup.buildNetwork')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
