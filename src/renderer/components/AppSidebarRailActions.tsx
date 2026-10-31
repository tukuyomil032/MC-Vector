import { Plus, Server, Settings2 } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/arc/popover/popover';
import { Tooltip } from '@/components/arc/tooltip/tooltip';
import { type TranslationKey, useTranslation } from '@/i18n';
import type { MinecraftServer, ServerStatus } from '../shared/server declaration';
import styles from './AppSidebar.module.css';

const STATUS_KEYS: Record<ServerStatus, TranslationKey> = {
  online: 'server.status.online',
  offline: 'server.status.offline',
  starting: 'server.status.starting',
  stopping: 'server.status.stopping',
  restarting: 'server.status.restarting',
  crashed: 'server.status.crashed',
};

interface AppSidebarRailActionsProps {
  /** Servers in the order the server panel shows them. */
  servers: MinecraftServer[];
  selectedServerId: string;
  onSelectServer: (serverId: string) => void;
  onAddServer: () => void;
  onOpenSettings: () => void;
}

/** Icon buttons that keep the window's main actions reachable while the sidebar is only a 60px rail. */
export default function AppSidebarRailActions({
  servers,
  selectedServerId,
  onSelectServer,
  onAddServer,
  onOpenSettings,
}: AppSidebarRailActionsProps) {
  const { t } = useTranslation();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const selected = servers.find((server) => server.id === selectedServerId);

  const railButton = (label: string, icon: ReactNode, onClick: () => void, testId: string) => (
    <Tooltip content={label} side="right">
      <button
        type="button"
        className={styles.railButton}
        data-testid={testId}
        aria-label={label}
        onClick={onClick}
      >
        {icon}
      </button>
    </Tooltip>
  );

  return (
    <div className={styles.railActions} data-testid="sidebar-rail-actions">
      <Popover open={isSwitcherOpen} onOpenChange={setIsSwitcherOpen}>
        <Tooltip content={t('nav.serverSwitcher')} side="right">
          <PopoverTrigger asChild>
            <button
              type="button"
              className={styles.railButton}
              data-testid="rail-server-switcher"
              aria-label={t('nav.serverSwitcher')}
            >
              <Server size={16} strokeWidth={1.75} aria-hidden={true} />
              {selected && (
                <span
                  className={`${styles.dot} ${styles.railStatus}`}
                  data-status={selected.status}
                  aria-hidden="true"
                />
              )}
            </button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent side="right" align="end" className={styles.switcherContent}>
          <div className={styles.switcherTitle}>{t('nav.serverSwitcher')}</div>
          {servers.length === 0 ? (
            <div className={styles.switcherEmpty}>{t('server.list.emptyTitle')}</div>
          ) : (
            servers.map((server) => (
              <button
                key={server.id}
                type="button"
                className={styles.switcherItem}
                data-testid={`rail-server-switcher-item-${server.id}`}
                aria-current={server.id === selectedServerId ? 'true' : undefined}
                onClick={() => {
                  onSelectServer(server.id);
                  setIsSwitcherOpen(false);
                }}
              >
                <span className={styles.dot} data-status={server.status} aria-hidden="true" />
                <span className={styles.switcherName}>{server.name}</span>
                <span className="sr-only">{t(STATUS_KEYS[server.status])}</span>
              </button>
            ))
          )}
        </PopoverContent>
      </Popover>
      {railButton(
        t('nav.addServer'),
        <Plus size={16} strokeWidth={1.75} aria-hidden={true} />,
        onAddServer,
        'rail-add-server-button',
      )}
      {railButton(
        t('settings.title'),
        <Settings2 size={16} strokeWidth={1.75} aria-hidden={true} />,
        onOpenSettings,
        'rail-settings-button',
      )}
    </div>
  );
}
