import { openUrl } from '@tauri-apps/plugin-opener';
import { logError } from '../../lib/error-utils';

/** Hosts the setup guides may open. Anything else is refused before it reaches the opener. */
const ALLOWED_GUIDE_HOSTS = new Set(['papermc.io', 'docs.papermc.io', 'dashboard.ngrok.com']);

export function isAllowedGuideUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      ALLOWED_GUIDE_HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

/** Opens a guide link in the system browser through the opener plugin. Resolves false when it was refused or could not open. */
export async function openGuideLink(url: string): Promise<boolean> {
  if (!isAllowedGuideUrl(url)) {
    logError('Refused a setup guide link outside the allowlist', new Error('Blocked guide URL'), {
      url,
    });
    return false;
  }
  try {
    await openUrl(url);
    return true;
  } catch (error) {
    logError('Failed to open a setup guide link', error, { url });
    return false;
  }
}
