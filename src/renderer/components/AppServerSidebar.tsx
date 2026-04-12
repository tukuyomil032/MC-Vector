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
  serversLabel: string;
  addServerLabel: string;
}

export default function AppServerSidebar({
  isSidebarOpen,
  groupedServers,
  selectedServerId,
  onSelectServer,
  onServerContextMenu,
  onAddServer,
  serversLabel,
  addServerLabel,
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
              <div
                key={server.id}
                className={`app-sidebar__server-item ${server.id === selectedServerId ? 'is-active' : ''}`}
                onClick={() => onSelectServer(server.id)}
                onContextMenu={(event) => onServerContextMenu(event, server.id)}
              >
                <div className={`status-indicator ${server.status}`}></div>
                <div className="flex flex-col">
                  <div className="font-semibold text-sm text-text-primary">{server.name}</div>
                  {server.profileName && (
                    <div className="text-[0.72rem] text-zinc-400">{server.profileName}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <button className="app-sidebar__add-server-btn" onClick={onAddServer}>
        + {addServerLabel}
      </button>
    </div>
  );
}
