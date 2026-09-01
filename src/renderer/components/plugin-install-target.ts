import type { PluginInstallTarget } from '../../lib/plugin-commands';

export function createPluginInstallTarget(
  serverId: string,
  relativeDir: 'plugins' | 'mods',
  fileName: string,
): PluginInstallTarget {
  return {
    serverId,
    relativeDir,
    fileName,
  };
}
