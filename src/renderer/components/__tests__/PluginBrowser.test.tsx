import { describe, expect, it } from 'vitest';
import { classifyPluginInstallFailure } from '../../../lib/plugin-install-errors';
import {
  pluginInstallFailurePresentation,
  shouldBlockPluginInstall,
} from '../../shared/plugin-install-policy';
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

  it('blocks confirmed incompatible installs before any provider or download work', () => {
    expect(shouldBlockPluginInstall('incompatible')).toBe(true);
    expect(shouldBlockPluginInstall('unknown')).toBe(false);
  });

  it('maps hashless Spiget rejection to a blocking feedback surface', () => {
    const failure = classifyPluginInstallFailure(
      JSON.stringify({
        code: 'unverified-artifact-blocked',
        message: 'checksum is required',
      }),
    );

    expect(failure.code).toBe('unverified-artifact-blocked');
    expect(pluginInstallFailurePresentation(failure.code)).toBe('dialog');
  });

  it('keeps network failures retryable and separate from security refusals', () => {
    expect(pluginInstallFailurePresentation('network')).toBe('inline');
    expect(pluginInstallFailurePresentation('source-rejected')).toBe('dialog');
  });
});
