import { describe, expect, it } from 'vitest';
import { createPluginInstallTarget } from '../plugin-install-target';

describe('PluginBrowser install destination contract', () => {
  it('targets plugins for Paper servers without generating a temporary filename', () => {
    const target = createPluginInstallTarget('server-1', 'plugins', 'VeinMiner-1.21.4.jar');

    expect(target).toEqual({
      serverId: 'server-1',
      relativeDir: 'plugins',
      fileName: 'VeinMiner-1.21.4.jar',
    });
    expect(`${target.relativeDir}/${target.fileName}`).toBe('plugins/VeinMiner-1.21.4.jar');
    expect(target.fileName).not.toContain('.tmp-');
  });

  it('targets mods for mod servers with the final jar filename', () => {
    const target = createPluginInstallTarget('server-2', 'mods', 'ExampleMod.jar');

    expect(`${target.relativeDir}/${target.fileName}`).toBe('mods/ExampleMod.jar');
    expect(target.fileName).not.toMatch(/\.jar\.tmp(?:-|$)/i);
  });
});
