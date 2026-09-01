import type { PluginInstallFailureCode } from '../../lib/plugin-install-errors';
import { type FeedbackPresentation, resolveFeedbackPresentation } from './feedback';

export type PluginCompatibilityStatus = 'checking' | 'compatible' | 'incompatible' | 'unknown';

export function shouldBlockPluginInstall(compatibility: PluginCompatibilityStatus): boolean {
  return compatibility === 'incompatible';
}

export function pluginInstallFailurePresentation(
  code: PluginInstallFailureCode,
): FeedbackPresentation {
  return resolveFeedbackPresentation({
    blocksAction: code !== 'network' && code !== 'unknown',
    retryable: code === 'network' || code === 'unknown',
  });
}
