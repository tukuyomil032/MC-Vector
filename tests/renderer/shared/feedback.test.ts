import { resolveFeedbackPresentation } from '@/renderer/shared/feedback';
import {
  pluginInstallFailurePresentation,
  shouldBlockPluginInstall,
} from '@/renderer/shared/plugin-install-policy';
import { describe, expect, it } from 'vitest';

describe('feedback presentation policy', () => {
  it('keeps successful and informational completion feedback as toast', () => {
    expect(resolveFeedbackPresentation({ success: true })).toBe('toast');
    expect(resolveFeedbackPresentation({})).toBe('toast');
  });

  it('uses inline feedback for recoverable retryable failures', () => {
    expect(resolveFeedbackPresentation({ retryable: true })).toBe('inline');
    expect(pluginInstallFailurePresentation('network')).toBe('inline');
    expect(pluginInstallFailurePresentation('unknown')).toBe('inline');
  });

  it('uses a blocking dialog for safety refusals and decisions', () => {
    expect(resolveFeedbackPresentation({ blocksAction: true })).toBe('dialog');
    expect(resolveFeedbackPresentation({ requiresDecision: true })).toBe('dialog');
    expect(pluginInstallFailurePresentation('unverified-artifact-blocked')).toBe('dialog');
    expect(pluginInstallFailurePresentation('checksum-mismatch')).toBe('dialog');
  });

  it('prioritizes progress surfaces for long-running work', () => {
    expect(resolveFeedbackPresentation({ progress: true, retryable: true })).toBe('progress');
  });
});

describe('plugin compatibility install policy', () => {
  it('blocks only confirmed incompatible plugins', () => {
    expect(shouldBlockPluginInstall('incompatible')).toBe(true);
    expect(shouldBlockPluginInstall('unknown')).toBe(false);
    expect(shouldBlockPluginInstall('checking')).toBe(false);
    expect(shouldBlockPluginInstall('compatible')).toBe(false);
  });
});
