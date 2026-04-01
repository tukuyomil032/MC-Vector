import { create } from 'zustand';

const MAX_LOG_LINES = 2000;
const LOG_FLUSH_INTERVAL_MS = 50;

const pendingLogsByServer: Record<string, string[]> = {};
let flushTimerId: ReturnType<typeof globalThis.setTimeout> | null = null;

function hasPendingLogs(): boolean {
  for (const lines of Object.values(pendingLogsByServer)) {
    if (lines.length > 0) {
      return true;
    }
  }
  return false;
}

interface ConsoleStoreState {
  serverLogs: Record<string, string[]>;
  appendServerLog: (serverId: string, line: string) => void;
  removeServerLogs: (serverId: string) => void;
  clearServerLogs: () => void;
}

export const useConsoleStore = create<ConsoleStoreState>((set) => ({
  serverLogs: {},
  appendServerLog: (serverId, line) => {
    const pending = pendingLogsByServer[serverId] ?? [];
    pending.push(line);
    pendingLogsByServer[serverId] = pending;

    if (flushTimerId) {
      return;
    }

    flushTimerId = globalThis.setTimeout(() => {
      flushTimerId = null;

      if (!hasPendingLogs()) {
        return;
      }

      set((state) => {
        const nextServerLogs = { ...state.serverLogs };

        for (const [pendingServerId, pendingLines] of Object.entries(pendingLogsByServer)) {
          if (pendingLines.length === 0) {
            continue;
          }

          const current = nextServerLogs[pendingServerId] ?? [];
          const merged = [...current, ...pendingLines];
          nextServerLogs[pendingServerId] =
            merged.length > MAX_LOG_LINES ? merged.slice(-MAX_LOG_LINES) : merged;

          pendingLogsByServer[pendingServerId] = [];
        }

        return {
          serverLogs: nextServerLogs,
        };
      });
    }, LOG_FLUSH_INTERVAL_MS);
  },
  removeServerLogs: (serverId) => {
    delete pendingLogsByServer[serverId];

    set((state) => {
      const next = { ...state.serverLogs };
      delete next[serverId];
      return { serverLogs: next };
    });
  },
  clearServerLogs: () => {
    for (const key of Object.keys(pendingLogsByServer)) {
      delete pendingLogsByServer[key];
    }

    if (flushTimerId) {
      globalThis.clearTimeout(flushTimerId);
      flushTimerId = null;
    }

    set({ serverLogs: {} });
  },
}));
