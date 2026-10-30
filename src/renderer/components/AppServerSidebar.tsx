import { Copy, LayoutTemplate, Plus, Server, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/arc/button/button';
import { Checkbox } from '@/components/arc/checkbox/checkbox';
import { ContextMenu, type ContextMenuItem } from '@/components/arc/context-menu/context-menu';
import { type TranslationKey, useTranslation } from '@/i18n';
import type { MinecraftServer, ServerStatus } from '../shared/server declaration';
import styles from './AppSidebar.module.css';

export interface AppServerGroup {
  groupName: string;
  servers: MinecraftServer[];
}

interface AppServerSidebarProps {
  groupedServers: AppServerGroup[];
  selectedServerId: string;
  onSelectServer: (serverId: string) => void;
  onAddServer: () => void;
  onDuplicateServer: (serverId: string) => Promise<void>;
  onSaveServerTemplate: (serverId: string) => Promise<void>;
  onDeleteServer: (serverId: string) => Promise<void>;
  onBulkStart: (servers: MinecraftServer[]) => Promise<void>;
  onBulkStop: (serverIds: string[]) => Promise<void>;
  onBulkBackup: (servers: MinecraftServer[]) => Promise<void>;
}

const STATUS_KEYS: Record<ServerStatus, TranslationKey> = {
  online: 'server.status.online',
  offline: 'server.status.offline',
  starting: 'server.status.starting',
  stopping: 'server.status.stopping',
  restarting: 'server.status.restarting',
  crashed: 'server.status.crashed',
};

export default function AppServerSidebar({
  groupedServers,
  selectedServerId,
  onSelectServer,
  onAddServer,
  onDuplicateServer,
  onSaveServerTemplate,
  onDeleteServer,
  onBulkStart,
  onBulkStop,
  onBulkBackup,
}: AppServerSidebarProps) {
  const { t } = useTranslation();
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkRunning, setIsBulkRunning] = useState(false);

  const allServers = groupedServers.flatMap((g) => g.servers);
  const hasServers = allServers.length > 0;

  const toggleBulkMode = () => {
    setIsBulkMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelect = (serverId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  };

  const selectedServers = allServers.filter((s) => selectedIds.has(s.id));

  const runBulk = async (action: () => Promise<void>) => {
    setIsBulkRunning(true);
    try {
      await action();
    } finally {
      setIsBulkRunning(false);
    }
  };

  const contextItemsFor = (server: MinecraftServer): ContextMenuItem[] => [
    {
      id: 'duplicate',
      label: t('server.actions.clone'),
      icon: <Copy size={15} strokeWidth={1.75} />,
      onSelect: () => void onDuplicateServer(server.id),
    },
    {
      id: 'template',
      label: t('server.actions.saveTemplate'),
      icon: <LayoutTemplate size={15} strokeWidth={1.75} />,
      onSelect: () => void onSaveServerTemplate(server.id),
    },
    {
      id: 'delete',
      label: t('common.delete'),
      icon: <Trash2 size={15} strokeWidth={1.75} />,
      destructive: true,
      testId: `delete-server-${server.id}`,
      onSelect: () => void onDeleteServer(server.id),
    },
  ];

  return (
    <div
      className={`app-sidebar__servers ${styles.panel} ${styles.serversPanel}`}
      data-testid="server-list"
    >
      <div className={`app-sidebar__servers-title ${styles.serversTitle}`}>
        <span>{t('server.title')}</span>
        {hasServers && (
          <Button
            type="button"
            variant={isBulkMode ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={isBulkMode}
            onClick={toggleBulkMode}
          >
            {t('nav.bulkSelect')}
          </Button>
        )}
      </div>

      {hasServers ? (
        <div className={`app-sidebar__server-list ${styles.serverList}`}>
          {groupedServers.map((group) => (
            <div key={group.groupName}>
              <div className={`app-sidebar__group-title ${styles.groupTitle}`}>
                {group.groupName}
              </div>

              {group.servers.map((server) => {
                const isSelected = server.id === selectedServerId;
                const statusLabel = t(STATUS_KEYS[server.status]);
                return (
                  <div key={server.id} className={styles.serverRow}>
                    {isBulkMode && (
                      <div className={styles.checkboxCell}>
                        <Checkbox
                          checked={selectedIds.has(server.id)}
                          onCheckedChange={() => toggleSelect(server.id)}
                          aria-label={t('nav.selectServer', { name: server.name })}
                        />
                      </div>
                    )}
                    <ContextMenu
                      trigger="context"
                      label={t('nav.serverMenu', { name: server.name })}
                      items={contextItemsFor(server)}
                      className={styles.serverMenuTarget}
                    >
                      <button
                        type="button"
                        className={`app-sidebar__server-item ${isSelected ? 'is-active' : ''} ${styles.serverItem}`}
                        data-testid={`server-card-${server.id}`}
                        aria-current={isSelected ? 'true' : undefined}
                        title={server.unavailableReason}
                        onClick={() => {
                          if (isBulkMode) {
                            toggleSelect(server.id);
                          } else {
                            onSelectServer(server.id);
                          }
                        }}
                      >
                        <span
                          className={styles.dot}
                          data-status={server.status}
                          aria-hidden="true"
                        />
                        <span className={styles.serverText}>
                          <span className={styles.serverName}>{server.name}</span>
                          {server.unavailableReason && (
                            <span className={styles.serverWarning}>{server.unavailableReason}</span>
                          )}
                          {server.profileName && (
                            <span className={styles.serverMeta}>{server.profileName}</span>
                          )}
                        </span>
                        <span className="sr-only">{statusLabel}</span>
                      </button>
                    </ContextMenu>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        // The content area carries the full empty state and the add action, so the sidebar keeps one quiet line.
        <div className={styles.emptyHint} data-testid="sidebar-empty-hint">
          <Server size={14} strokeWidth={1.75} aria-hidden={true} />
          <span>{t('server.list.emptyTitle')}</span>
        </div>
      )}

      {isBulkMode && selectedIds.size > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>
            {t('nav.bulkSelectedCount', { count: selectedIds.size })}
          </span>
          <div className={styles.bulkActions}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isBulkRunning}
              data-testid="bulk-start-button"
              onClick={() => runBulk(() => onBulkStart(selectedServers))}
            >
              {t('nav.bulkStartSelected')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isBulkRunning}
              onClick={() => runBulk(() => onBulkStop(selectedServers.map((s) => s.id)))}
            >
              {t('nav.bulkStopSelected')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isBulkRunning}
              onClick={() => runBulk(() => onBulkBackup(selectedServers))}
            >
              {t('nav.bulkBackupSelected')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              {t('nav.bulkClearSelection')}
            </Button>
          </div>
        </div>
      )}

      {hasServers && (
        <div className={styles.addRow}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="create-server-button"
            onClick={onAddServer}
          >
            <Plus size={14} strokeWidth={1.75} aria-hidden={true} />
            {t('nav.addServer')}
          </Button>
        </div>
      )}
    </div>
  );
}
