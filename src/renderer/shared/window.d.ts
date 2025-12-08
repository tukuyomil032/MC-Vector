import { MinecraftServer } from './server declaration';
import { ProxyNetworkConfig } from '../components/ProxySetupView';

export interface IElectronAPI {
  startServer: (id: string) => Promise<void>;
  stopServer: (id: string) => Promise<void>;
  // ★追加: プロキシ構築用のAPI定義
  setupProxy: (config: ProxyNetworkConfig) => Promise<{ success: boolean; message: string }>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}