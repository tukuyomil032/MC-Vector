import { create } from 'zustand';
import type { MinecraftServer } from '../renderer/shared/server declaration';
import { type StateUpdater, resolveStateUpdater } from './store-types';

interface ServerStoreState {
  servers: MinecraftServer[];
  selectedServerId: string;
  setServers: (value: StateUpdater<MinecraftServer[]>) => void;
  setSelectedServerId: (value: StateUpdater<string>) => void;
}

export const useServerStore = create<ServerStoreState>((set) => ({
  servers: [],
  selectedServerId: '',
  setServers: (value) => {
    set((state) => ({
      servers: resolveStateUpdater(state.servers, value),
    }));
  },
  setSelectedServerId: (value) => {
    set((state) => ({
      selectedServerId: resolveStateUpdater(state.selectedServerId, value),
    }));
  },
}));
