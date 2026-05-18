import * as ContextMenu from '@radix-ui/react-context-menu';
import { useState } from 'react';
import { cn } from '@/lib/ui';
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
  onAddServer: () => void;
  onDuplicateServer: (serverId: string) => Promise<void>;
  onSaveServerTemplate: (serverId: string) => Promise<void>;
  onDeleteServer: (serverId: string) => Promise<void>;
  serversLabel: string;
  addServerLabel: string;
  bulkSelectLabel: string;
  bulkStartLabel: string;
  bulkStopLabel: string;
  bulkBackupLabel: string;
  bulkClearLabel: string;
  bulkSelectedCountLabel: (count: number) => string;
  duplicateLabel: string;
  saveTemplateLabel: string;
  deleteLabel: string;
  onBulkStart: (servers: MinecraftServer[]) => Promise<void>;
  onBulkStop: (serverIds: string[]) => Promise<void>;
  onBulkBackup: (servers: MinecraftServer[]) => Promise<void>;
}

const contextMenuContentClass =
  'z-50 min-w-[9rem] overflow-hidden rounded-md border border-zinc-700 bg-[#1e1e20] py-1 shadow-xl animate-in fade-in-0 zoom-in-95';

const contextMenuItemClass =
  'relative flex cursor-default select-none items-center gap-2 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors data-[highlighted]:bg-white/10';

const contextMenuDangerItemClass =
  'relative flex cursor-default select-none items-center gap-2 rounded px-3 py-1.5 text-sm text-red-400 outline-none transition-colors data-[highlighted]:bg-red-500/20';

export default function AppServerSidebar({
  isSidebarOpen,
  groupedServers,
  selectedServerId,
  onSelectServer,
  onAddServer,
  onDuplicateServer,
  onSaveServerTemplate,
  onDeleteServer,
  serversLabel,
  addServerLabel,
  bulkSelectLabel,
  bulkStartLabel,
  bulkStopLabel,
  bulkBackupLabel,
  bulkClearLabel,
  bulkSelectedCountLabel,
  duplicateLabel,
  saveTemplateLabel,
  deleteLabel,
  onBulkStart,
  onBulkStop,
  onBulkBackup,
}: AppServerSidebarProps) {
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkRunning, setIsBulkRunning] = useState(false);

  if (!isSidebarOpen) {
    return null;
  }

  const allServers = groupedServers.flatMap((g) => g.servers);

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

  return (
    <div className="app-sidebar__servers app-shell__surface app-shell__surface--sidebar-panel surface-card">
      <div className="app-sidebar__servers-title flex items-center justify-between">
        <span>{serversLabel}</span>
        <button
          type="button"
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${isBulkMode ? 'bg-accent text-white' : 'text-zinc-400 hover:text-text-primary'}`}
          onClick={toggleBulkMode}
          title={bulkSelectLabel}
        >
          {bulkSelectLabel}
        </button>
      </div>
      <div className="app-sidebar__server-list">
        {groupedServers.map((group) => (
          <div key={group.groupName} className="mb-2.5">
            <div className="app-sidebar__group-title">{group.groupName}</div>

            {group.servers.map((server) => (
              <div key={server.id} className="flex items-center gap-1">
                {isBulkMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(server.id)}
                    onChange={() => toggleSelect(server.id)}
                    className="flex-shrink-0 accent-[#5865F2]"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <ContextMenu.Root>
                  <ContextMenu.Trigger asChild>
                    <button
                      type="button"
                      className={`app-sidebar__server-item flex-1 ${server.id === selectedServerId ? 'is-active' : ''}`}
                      onClick={() => {
                        if (isBulkMode) {
                          toggleSelect(server.id);
                        } else {
                          onSelectServer(server.id);
                        }
                      }}
                    >
                      <span className={`status-indicator ${server.status}`}></span>
                      <span className="flex flex-col">
                        <span className="font-semibold text-sm text-text-primary">{server.name}</span>
                        {server.profileName && (
                          <span className="text-[0.72rem] text-zinc-400">{server.profileName}</span>
                        )}
                      </span>
                    </button>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content className={contextMenuContentClass}>
                      <ContextMenu.Item
                        className={contextMenuItemClass}
                        onSelect={() => void onDuplicateServer(server.id)}
                      >
                        📄 {duplicateLabel}
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className={contextMenuItemClass}
                        onSelect={() => void onSaveServerTemplate(server.id)}
                      >
                        🧩 {saveTemplateLabel}
                      </ContextMenu.Item>
                      <ContextMenu.Separator className="my-1 h-px bg-zinc-700" />
                      <ContextMenu.Item
                        className={cn(contextMenuDangerItemClass)}
                        onSelect={() => void onDeleteServer(server.id)}
                      >
                        🗑️ {deleteLabel}
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              </div>
            ))}
          </div>
        ))}
      </div>

      {isBulkMode && selectedIds.size > 0 && (
        <div className="flex flex-col gap-1 py-2 border-t border-zinc-700">
          <span className="text-xs text-zinc-400 px-1">
            {bulkSelectedCountLabel(selectedIds.size)}
          </span>
          <div className="flex gap-1 flex-wrap">
            <button
              type="button"
              className="app-sidebar__add-server-btn flex-1 text-xs"
              disabled={isBulkRunning}
              onClick={() => runBulk(() => onBulkStart(selectedServers))}
            >
              {bulkStartLabel}
            </button>
            <button
              type="button"
              className="app-sidebar__add-server-btn flex-1 text-xs"
              disabled={isBulkRunning}
              onClick={() => runBulk(() => onBulkStop(selectedServers.map((s) => s.id)))}
            >
              {bulkStopLabel}
            </button>
            <button
              type="button"
              className="app-sidebar__add-server-btn flex-1 text-xs"
              disabled={isBulkRunning}
              onClick={() => runBulk(() => onBulkBackup(selectedServers))}
            >
              {bulkBackupLabel}
            </button>
            <button
              type="button"
              className="app-sidebar__add-server-btn text-xs"
              onClick={() => setSelectedIds(new Set())}
            >
              {bulkClearLabel}
            </button>
          </div>
        </div>
      )}

      <button className="app-sidebar__add-server-btn w-full" onClick={onAddServer}>
        + {addServerLabel}
      </button>
    </div>
  );
}
