import type { MouseEvent } from 'react';
import type { MinecraftServer } from '../shared/server declaration';

export interface AppServerGroup {
  groupName: string;
  servers: MinecraftServer[];
}

interface AppServerSidebarProps {
  isSidebarOpen: boolean;
  groupedServers: AppServerGroup[];
  selectedServerId: string;
  onSelectServer: (serverId: string) => void;
  onServerContextMenu: (event: MouseEvent, serverId: string) => void;
  onAddServer: () => void;
  onImportServer: () => void;
  serversLabel: string;
  addServerLabel: string;
  importServerLabel: string;
}

export default function AppServerSidebar({
  isSidebarOpen,
  groupedServers,
  selectedServerId,
  onSelectServer,
  onServerContextMenu,
  onAddServer,
  onImportServer,
  serversLabel,
  addServerLabel,
  importServerLabel,
}: AppServerSidebarProps) {
  if (!isSidebarOpen) {
    return null;
  }

  return (
    <div className="app-sidebar__servers app-shell__surface app-shell__surface--sidebar-panel surface-card">
      <div className="app-sidebar__servers-title">{serversLabel}</div>
      <div className="app-sidebar__server-list">
        {groupedServers.map((group) => (
          <div key={group.groupName} className="mb-2.5">
            <div className="app-sidebar__group-title">{group.groupName}</div>

            {group.servers.map((server) => (
              <button
                key={server.id}
                type="button"
                className={`app-sidebar__server-item ${server.id === selectedServerId ? 'is-active' : ''}`}
                onClick={() => onSelectServer(server.id)}
                onContextMenu={(event) => onServerContextMenu(event, server.id)}
              >
                <span className={`status-indicator ${server.status}`}></span>
                <span className="flex flex-col">
                  <span className="font-semibold text-sm text-text-primary">{server.name}</span>
                  {server.profileName && (
                    <span className="text-[0.72rem] text-zinc-400">{server.profileName}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button className="app-sidebar__add-server-btn flex-1" onClick={onAddServer}>
          + {addServerLabel}
        </button>
        <button
          className="app-sidebar__add-server-btn"
          onClick={onImportServer}
          title={importServerLabel}
        >
          ↓
        </button>
      </div>
    </div>
  );
}
